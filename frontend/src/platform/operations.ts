// Operações (map #72, W7), only for a Pessoa with `admin: true`: the push
// of filmes-dados (#121's status, and a push now), `evaluate` with its live
// progress and its report (#103), and the read-only SQL console (`consult`,
// #102). The forms post to `/operacoes/acao`; the console is a GET of the
// page. Server only.

import { readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import {
  checkDatabase,
  consult,
  evaluate,
  evaluationsFolder,
  progressTo,
  pushNow,
  pushStatus,
  type ConsultResult,
  type ConsultValue,
  type Engine,
  type ErrorCode,
  type ErrorOutput,
  type Evaluation,
  type EvaluationProgress,
  type Measures,
  type OnlineMeasures,
  type Outcome,
  type PushStatus,
} from '@filmes/engine'
import {
  parseOperation,
  type OperationsRefusal,
} from '#/content/operations-form'
import { appEngine } from './engine'
import { appPoster, failureOf, formPoster, seeOther } from './form-post'

/** What Operações needs of the logged-in Dono (`platform/owners.ts`'s
 * Owner): who she is, and whether admin. */
export type Operator = { name: string; admin: boolean }

/** The console shows this many rows at most; the count says how many the
 * query gave. */
export const CONSULT_ROWS = 200

/** A column or a cell of the console's table, with a key for the page
 * (two columns may share a name). */
export type ConsultCell = { key: string; value: ConsultValue }

/** What the console answers: the table, or why not (the engine's code). */
export type ConsultAnswer =
  | {
      sql: string
      columns: { key: string; name: string }[]
      rows: { key: string; cells: ConsultCell[] }[]
      /** Rows the query gave, before the cut. */
      total: number
    }
  | { sql: string; error: { code: string; message: string } }

/** The measures of a finished `evaluate`, as the page shows them. */
export type EvaluationSummary = {
  date: string
  offline: { people: Measures; movielens: Measures }
  online: OnlineMeasures
  priority: 'online' | 'offline'
  warnings: string[]
  /** The grid's three best weight sets, when it ran. */
  best: { recall50: number | null; coverageTop5: number | null }[] | null
  /** The report's file name in the evaluations folder. */
  file: string
}

type JobStart = { by: string; grid: boolean; startedAt: string }

/** The process's `evaluate`: none yet, running, or how the last one
 * ended. */
export type EvaluationJob =
  | { state: 'idle' }
  | (JobStart & { state: 'running'; progress: number; message: string })
  | (JobStart & {
      state: 'done'
      finishedAt: string
      result: EvaluationSummary
    })
  | (JobStart & {
      state: 'failed'
      finishedAt: string
      error: { code: string; message: string }
    })

/** The latest report in the evaluations folder. */
export type EvaluationReport = { date: string; text: string }

/** The evaluation's part of the page: whether a folder is set for the
 * reports (`FILMES_AVALIACOES` has no default), the run, the report. */
export type EvaluationPanel = {
  folder: 'ready' | 'unset' | 'unavailable'
  job: EvaluationJob
  report: EvaluationReport | null
}

/** What `/operacoes` shows; `push` is null when the engine cannot run
 * here. */
export type OperationsPage = {
  push: PushStatus | null
  evaluation: EvaluationPanel
  consult: ConsultAnswer | null
}

/** What the screen needs from the engine. */
export interface Operations {
  consult(sql: string): Promise<Outcome<ConsultResult>>
  pushStatus(): Promise<Outcome<PushStatus>>
  push(): Promise<Outcome<PushStatus>>
  evaluationsFolder(): Promise<Outcome<string>>
  evaluate(
    grid: boolean,
    listen: (event: EvaluationProgress) => void,
  ): Promise<Outcome<Evaluation>>
}

const failed = (code: ErrorCode, message: string): Outcome<never> => ({
  exitCode: 1,
  output: { error: { code, message } },
})

/** The screen's operations on `engine`. `evaluate` reads the live database:
 * it is in WAL mode (#125), so writes go on while it measures. */
export function operationsFromEngine(engine: Engine): Operations {
  return {
    consult: (sql) => engine.run(consult(sql)),
    pushStatus: () => engine.run(pushStatus),
    push: () => engine.run(pushNow),
    evaluationsFolder: () => engine.run(evaluationsFolder),
    evaluate: (grid, listen) =>
      engine.run(evaluate({ grid, onProgress: progressTo(listen) })),
  }
}

/** An engine error the admin cannot fix from the page goes to the server
 * log (`docker logs`). */
function logEngineError(outcome: { output: ErrorOutput }): void {
  const { code, message } = outcome.output.error
  console.error(`engine: ${code}: ${message}`)
}

const number = (value: unknown): number | null =>
  typeof value === 'number' ? value : null

/** The grid's best entries, from the report's loose shape. */
function bestOf(grid: Evaluation['grid']): EvaluationSummary['best'] {
  if (!grid || !Array.isArray(grid.best)) return null
  return grid.best.map((entry) => {
    const e = (entry ?? {}) as Record<string, unknown>
    return {
      recall50: number(e.recall50),
      coverageTop5: number(e.coverageTop5),
    }
  })
}

const summaryOf = (evaluation: Evaluation): EvaluationSummary => ({
  date: evaluation.date,
  offline: evaluation.offline,
  online: evaluation.online,
  priority: evaluation.priority,
  warnings: [...evaluation.warnings],
  best: bestOf(evaluation.grid),
  file: basename(evaluation.file),
})

const REPORT_NAME = /^\d{4}-\d{2}-\d{2}\.md$/

/** The newest dated report in `folder`, or null (no folder, no report). */
export function latestReport(folder: string): EvaluationReport | null {
  let names: string[]
  try {
    names = readdirSync(folder).filter((name) => REPORT_NAME.test(name))
  } catch {
    return null
  }
  const name = names.sort().at(-1)
  if (name === undefined) return null
  return {
    date: name.slice(0, -'.md'.length),
    text: readFileSync(join(folder, name), 'utf8'),
  }
}

/** One `evaluate` at a time per process, with its progress kept for the
 * page to read while it runs. */
export class EvaluationRuns {
  #job: EvaluationJob = { state: 'idle' }
  readonly #operations: Operations
  readonly #now: () => Date

  constructor(operations: Operations, now: () => Date = () => new Date()) {
    this.#operations = operations
    this.#now = now
  }

  get current(): EvaluationJob {
    return this.#job
  }

  /** Starts a run for `by` (the admin's name): the promise ends with it.
   * `busy` while another one runs. */
  start(by: string, grid: boolean): Promise<void> | 'busy' {
    if (this.#job.state === 'running') return 'busy'
    const start: JobStart = {
      by,
      grid,
      startedAt: this.#now().toISOString(),
    }
    this.#job = { ...start, state: 'running', progress: 0, message: '' }
    return this.#operations
      .evaluate(grid, ({ progress, message }) => {
        this.#job = { ...start, state: 'running', progress, message }
      })
      .catch((error: unknown) =>
        failed(
          'internal',
          error instanceof Error ? error.message : String(error),
        ),
      )
      .then((outcome) => {
        const finishedAt = this.#now().toISOString()
        if (outcome.exitCode === 0)
          this.#job = {
            ...start,
            state: 'done',
            finishedAt,
            result: summaryOf(outcome.output),
          }
        else {
          logEngineError(outcome)
          this.#job = {
            ...start,
            state: 'failed',
            finishedAt,
            error: outcome.output.error,
          }
        }
      })
  }
}

/** The evaluation's part of the page, read again while a run goes on. */
export async function evaluationPanel(
  operations: Operations,
  runs: EvaluationRuns,
): Promise<EvaluationPanel> {
  const job = runs.current
  const folder = await operations.evaluationsFolder()
  if (folder.exitCode === 0)
    return { folder: 'ready', job, report: latestReport(folder.output) }
  if (folder.output.error.code === 'missing_config')
    return { folder: 'unset', job, report: null }
  logEngineError(folder)
  return { folder: 'unavailable', job, report: null }
}

/** The console's answer to `sql`: the first `CONSULT_ROWS` rows, or the
 * engine's refusal. */
export async function consultAnswer(
  operations: Operations,
  sql: string,
): Promise<ConsultAnswer> {
  const outcome = await operations.consult(sql)
  if (outcome.exitCode === 0) {
    const { columns, rows } = outcome.output
    return {
      sql,
      columns: columns.map((name, c) => ({ key: `c${c}`, name })),
      rows: rows.slice(0, CONSULT_ROWS).map((row, r) => ({
        key: `r${r}`,
        cells: row.map((value, c) => ({ key: `c${c}`, value })),
      })),
      total: rows.length,
    }
  }
  const { code } = outcome.output.error
  if (code !== 'read_only' && code !== 'invalid_sql') logEngineError(outcome)
  return { sql, error: outcome.output.error }
}

/** What `/operacoes` shows, with the console's answer when `sql` came. */
export async function operationsPage(
  operations: Operations,
  runs: EvaluationRuns,
  sql: string | undefined,
): Promise<OperationsPage> {
  const status = await operations.pushStatus()
  if (status.exitCode !== 0) logEngineError(status)
  return {
    push: status.exitCode === 0 ? status.output : null,
    evaluation: await evaluationPanel(operations, runs),
    consult: sql === undefined ? null : await consultAnswer(operations, sql),
  }
}

/** The banner every Dono page shows an admin while pushes keep failing;
 * null for anyone else, or while they work. */
export async function pushAlert(
  owner: Pick<Operator, 'admin'>,
  operations: Operations,
): Promise<PushStatus | null> {
  if (!owner.admin) return null
  const status = await operations.pushStatus()
  return status.exitCode === 0 && status.output.alert ? status.output : null
}

const back = (query: string) => seeOther(`/operacoes?${query}`)

async function evaluateAction(
  operations: Operations,
  runs: EvaluationRuns,
  by: string,
  grid: boolean,
): Promise<Response> {
  const folder = await operations.evaluationsFolder()
  if (folder.exitCode !== 0) {
    if (folder.output.error.code === 'missing_config')
      return refused('sem-pasta')
    logEngineError(folder)
    return refused(failureOf(folder))
  }
  // The run goes on after the answer; the page follows its progress.
  const run = runs.start(by, grid)
  return run === 'busy' ? refused('em-andamento') : back('feito=avaliando')
}

const refused = (refusal: OperationsRefusal) => back(`erro=${refusal}`)

/** `POST /operacoes/acao`: starts `evaluate`, or tries the push now, and
 * goes back to the page. Only an admin Dono, and only a form of this site:
 * the page gate does not cover this route. */
export async function operationsAction(
  request: Request,
  owner: Operator | null,
  operations: Operations,
  runs: EvaluationRuns,
  origin: string | undefined,
): Promise<Response> {
  const poster = formPoster(request, owner, origin)
  if (poster instanceof Response) return poster
  if (!poster.admin) return new Response('Só para admin', { status: 403 })
  const action = parseOperation(await request.formData())
  if (action === undefined) return refused('pedido')
  if (action.kind === 'evaluate')
    return evaluateAction(operations, runs, poster.name, action.grid)
  const pushed = await operations.push()
  if (pushed.exitCode !== 0) {
    logEngineError(pushed)
    return refused(failureOf(pushed))
  }
  return back('feito=enviado')
}

// --- the app's -----------------------------------------------------------------

const appOperations = () => operationsFromEngine(appEngine())

let runs: EvaluationRuns | undefined
/** The process's one evaluation at a time. */
const appRuns = () => (runs ??= new EvaluationRuns(appOperations()))

/** `/operacoes` for the app. */
export const appOperationsPage = (sql: string | undefined) =>
  operationsPage(appOperations(), appRuns(), sql)

/** The evaluation's progress for the app. */
export const appEvaluationPanel = () =>
  evaluationPanel(appOperations(), appRuns())

/** The push banner for the logged-in Dono. */
export const appPushAlert = (owner: Operator) =>
  pushAlert(owner, appOperations())

/** The form's route for the app: the logged-in Dono, the process's engine. */
export const serveOperationsAction = (request: Request) => {
  const { owner, origin } = appPoster(request)
  return operationsAction(request, owner, appOperations(), appRuns(), origin)
}

// --- `/saude` -----------------------------------------------------------------

// `GET /saude` (#258): whether this app can serve from the database it was
// given. The deploy's swap probes it on the new container before Nginx moves
// over (`scripts/deploy-plan.ts`), so code whose schema does not match the
// live database never goes live. Says one word, nothing about the server.

/** The word for each state; anything else the engine refused is `falha`. */
const WORDS: Readonly<Record<string, string>> = {
  outdated_database: 'banco-desatualizado',
  missing_database: 'sem-banco',
}

export async function health(engine: Engine): Promise<Response> {
  const outcome = await engine.run(checkDatabase)
  const word =
    outcome.exitCode === 0
      ? 'ok'
      : (WORDS[outcome.output.error.code] ?? 'falha')
  return new Response(`${word}\n`, {
    status: word === 'ok' ? 200 : 503,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

/** `/saude` for the app: the process's engine. */
export const serveHealth = () => health(appEngine())
