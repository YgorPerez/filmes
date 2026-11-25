// The real-database run (#76 §4.2 item 2, §4.6): the seeded requests over a
// copy of the real database and filmes-dados, on both engines, compared as
// the fixture replay compares a step (output, filmes-dados, the data
// tables), with Python's double-seed self-check.
//
// Nothing here writes to the real files: they are copied once, read-only,
// into `work/base`, and every side works on its own copy of that.

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { migrateConfig } from '@filmes/key-migration'
import { Effect } from 'effect'
import { parse as parseToml } from 'smol-toml'
import { parse as parseYaml } from 'yaml'
import { makeEngine } from '../../src/runtime/Engine.ts'
import { Fetch } from '../../src/sources/Source.ts'
import { loadAdapter, type Adapted, type Adapter } from '../adapter/index.ts'
import {
  compareOutcomes,
  mapStrings,
  placeholders,
  pythonDataPaths,
  type Difference,
  type Outcome,
} from '../compare.ts'
import { loadDecisions, type Decision } from '../decisions.ts'
import { ROOT } from '../paths.ts'
import { pythonEnv, runPython } from '../python.ts'
import {
  pythonInEnglish,
  pythonVars,
  tsVars,
  type ScenarioResult,
  type StepResult,
} from '../replay.ts'
import { buildReport, type Report } from '../report.ts'
import type { Step } from '../scenario.ts'
import { compareDatabases, compareTrees, migratedCopy } from '../state.ts'
import {
  CACHE,
  cacheCounts,
  copyCache,
  copySource,
  createLane,
  dataTables,
  DATABASE,
  freeBytes,
  resetLane,
  syncTypeScript,
  type Lane,
  type RealSource,
} from './lane.ts'
import { NoSession, plan, SkipStep, type PlannedScenario } from './plan.ts'

/** The variables of the on-demand sources' API keys. */
export const KEY_VARIABLES = [
  'FILMES_OMDB_CHAVE',
  'FILMES_DDD_CHAVE',
  'FILMES_TMDB_CHAVE',
] as const

/** The real paths from a `local.toml` (`[caminhos] banco, dados`). The file
 * is read here and its contents go nowhere else. */
export function readLocalToml(file: string): RealSource {
  const parsed = parseToml(readFileSync(file, 'utf8')) as {
    caminhos?: { banco?: string; dados?: string }
  }
  const database = parsed.caminhos?.banco
  const data = parsed.caminhos?.dados
  if (!database || !data)
    throw new Error(`${file}: [caminhos] banco and dados are required`)
  return {
    database,
    data,
    cache: database.replace(/\.[^./]*$/, '') + '-cache.sqlite',
  }
}

/** The Pessoas of a filmes-dados (Portuguese): slugs, and every name and
 * alias, so the report can leave them out. */
export function readPeople(data: string): {
  slugs: string[]
  names: string[]
  owner?: string
} {
  const folder = join(data, 'pessoas')
  const slugs: string[] = []
  const names: string[] = []
  let owner: string | undefined
  for (const file of readdirSync(folder)
    .filter((f) => f.endsWith('.md'))
    .sort()) {
    const slug = file.slice(0, -'.md'.length)
    slugs.push(slug)
    const front = /^---\n([\s\S]*?\n)---\n/.exec(
      readFileSync(join(folder, file), 'utf8'),
    )
    const fields = (parseYaml(front?.[1] ?? '', { version: '1.1' }) ?? {}) as {
      nome?: unknown
      apelidos?: unknown
      dono?: unknown
    }
    if (fields.dono === true) owner ??= slug
    for (const value of [
      fields.nome,
      ...(Array.isArray(fields.apelidos) ? fields.apelidos : []),
    ])
      if (typeof value === 'string' && value.trim() !== '')
        names.push(value.trim())
  }
  return {
    slugs,
    names: [...new Set([...slugs, ...names])],
    ...(owner !== undefined && { owner }),
  }
}

const sessionFiles = (folder: string): number =>
  existsSync(folder)
    ? readdirSync(folder).filter((file) => file.endsWith('.md')).length
    : 0

/** The Climas of `config/climas.toml`. */
const readMoods = (): string[] =>
  Object.keys(
    parseToml(readFileSync(join(ROOT, 'config', 'climas.toml'), 'utf8')),
  )

/** Well-known films for `--parecido` and an outside Feedback film. */
function readReferences(database: string): string[] {
  const db = new DatabaseSync(database, { readOnly: true })
  try {
    return db
      .prepare('SELECT id FROM filmes ORDER BY votos DESC, id LIMIT 200')
      .all()
      .map((row) => String(row['id']))
  } finally {
    db.close()
  }
}

/** The TypeScript pass never reaches the network: what Python fetched is in
 * the cache copy, and anything else fails as an unreachable network. */
const offlineFetch: typeof globalThis.fetch = () =>
  Promise.reject(
    new TypeError('fetch failed', {
      cause: new Error(
        'oracle --real: the TypeScript pass reads only the cache Python filled',
      ),
    }),
  )

async function runTypeScript(
  adapted: Extract<Adapted, { kind: 'ported' }>,
  vars: Record<string, string>,
): Promise<Outcome> {
  const engine = makeEngine(vars)
  try {
    const outcome = await engine.run(
      Effect.provideService(adapted.operation, Fetch, offlineFetch),
    )
    return {
      exitCode: outcome.exitCode,
      output: JSON.parse(JSON.stringify(outcome.output) ?? 'null') as unknown,
    }
  } finally {
    await engine.dispose()
  }
}

export interface RealOptions {
  readonly python: string
  readonly source: RealSource
  /** Where the copies go; removed at the end unless `keep`. */
  readonly work: string
  readonly seed: number
  readonly count?: number
  /** `FILMES_HOJE` of every step. */
  readonly today: string
  readonly lanes: number
  readonly selfCheck?: boolean
  /** Hand the machine's API keys to Python's seed-0 pass (the only one that
   * may reach a source). Off: no side has a key. */
  readonly liveKeys?: boolean
  readonly keep?: boolean
  readonly adapter?: Adapter
  readonly decisions?: readonly Decision[]
  readonly onScenario?: (
    result: ScenarioResult,
    done: number,
    total: number,
  ) => void
}

export interface RealResult {
  readonly report: Report
  readonly results: readonly ScenarioResult[]
  /** What the report says about the run, with no private data. */
  readonly facts: RealFacts
  /** Names and slugs to keep out of anything committed. */
  readonly private: readonly string[]
}

export interface RealFacts {
  readonly seed: number
  readonly today: string
  readonly scenarios: number
  readonly people: number
  readonly sessionsInData: number
  readonly films: number
  readonly dataTables: readonly string[]
  readonly keys: readonly string[]
  readonly cacheBefore: Readonly<Record<string, number>>
  /** Cache rows Python's seed-0 pass added (fetched), per source, summed
   * over the scenarios (each starts from the base cache). */
  readonly fetched: Readonly<Record<string, number>>
  /** Steps not run: an earlier step opened no Session, or a redo had no
   * film to keep or swap. */
  readonly stopped: number
  readonly seconds: number
}

const stepEnv = (today: string): Record<string, string> => ({
  FILMES_BANCO: `{work}/${DATABASE}`,
  FILMES_CACHE: `{work}/${CACHE}`,
  FILMES_DADOS: '{work}/dados',
  FILMES_HOJE: today,
  FILMES_LOCAL: '{work}/sem-config-local.toml',
})

/** One planned scenario on a lane. Never throws: a harness failure is
 * `error`. */
async function replayReal(
  scenario: PlannedScenario,
  lane: Lane,
  context: {
    readonly python: string
    readonly adapter: Adapter
    readonly config: string
    readonly base: string
    readonly tables: readonly string[]
    readonly today: string
    readonly selfCheck: boolean
    readonly keys: Readonly<Record<string, string>>
  },
): Promise<{ result: ScenarioResult; stopped: number }> {
  const steps: StepResult[] = []
  const outputs: unknown[] = []
  const env = stepEnv(context.today)
  const step: Step = { argv: [], stdin: null, env, files: {} }
  const asWork0 = placeholders(lane.py0, ROOT)
  const asWork1 = placeholders(lane.py1, ROOT)
  const asWorkTs = placeholders(lane.ts, ROOT)
  const asWorkPy = (text: string) => pythonDataPaths(asWork0(text))
  const database = (folder: string) => join(folder, DATABASE)
  let skipped = 0
  try {
    resetLane(lane, context.base, context.tables)
    for (const [index, planned] of scenario.steps.entries()) {
      let built: { argv: readonly string[]; stdin: string | null }
      try {
        built = planned.build({ outputs, work: lane.py0 })
      } catch (error) {
        if (error instanceof NoSession)
          return {
            result: { id: scenario.id, steps },
            stopped: skipped + scenario.steps.length - index,
          }
        if (error instanceof SkipStep) {
          outputs.push(null)
          skipped++
          continue
        }
        throw error
      }
      const adapted = context.adapter.adapt(
        built.argv,
        built.stdin,
        pythonVars(step, lane.py0),
      )
      if (adapted.kind === 'ported') syncTypeScript(lane, context.tables)

      const seed0 = await runPython(context.python, built.argv, built.stdin, {
        ...pythonEnv(pythonVars(step, lane.py0), 0),
        ...context.keys,
      })
      outputs.push(seed0.output)
      // The capture: the other sides read what seed 0 got.
      copyCache(join(lane.py0, CACHE), join(lane.py1, CACHE))
      if (adapted.kind === 'ported')
        copyCache(join(lane.py0, CACHE), join(lane.ts, CACHE))

      const vars = tsVars(step, lane.ts, context.config)
      const [seed1, tsOutcome] = await Promise.all([
        context.selfCheck
          ? runPython(
              context.python,
              built.argv,
              built.stdin,
              pythonEnv(pythonVars(step, lane.py1), 1),
            )
          : undefined,
        adapted.kind === 'ported' ? runTypeScript(adapted, vars) : undefined,
      ])
      const differences: Difference[] = []
      if (seed1)
        differences.push(
          ...compareOutcomes(
            {
              exitCode: seed0.exitCode,
              output: mapStrings(seed0.output, asWork0),
            },
            {
              exitCode: seed1.exitCode,
              output: mapStrings(seed1.output, asWork1),
            },
            {},
            'self-check',
          ),
          ...compareTrees(
            join(lane.py0, 'dados'),
            join(lane.py1, 'dados'),
            'data',
            'self-check',
            {
              mode: 'bytes',
              python: asWork0,
              ts: asWork1,
            },
          ),
          ...compareDatabases(
            database(lane.py0),
            database(lane.py1),
            'self-check',
            { python: asWork0, ts: asWork1 },
            context.tables,
          ),
        )
      if (adapted.kind === 'ported' && tsOutcome) {
        const mapped = pythonInEnglish(adapted.command, seed0)
        if ('check' in mapped) differences.push(mapped)
        else
          differences.push(
            ...compareOutcomes(
              {
                exitCode: mapped.exitCode,
                output: mapStrings(mapped.output, asWorkPy),
              },
              {
                exitCode: tsOutcome.exitCode,
                output: mapStrings(tsOutcome.output, asWorkTs),
              },
              adapted,
            ),
          )
        differences.push(
          ...compareTrees(
            migratedCopy(
              join(lane.py0, 'dados'),
              join(lane.py0, '..', 'py0-en'),
            ),
            join(lane.ts, 'data'),
            'data',
            'parity',
            { mode: 'semantic', python: asWorkPy, ts: asWorkTs },
          ),
          ...compareDatabases(
            database(lane.py0),
            database(lane.ts),
            'parity',
            { python: asWorkPy, ts: asWorkTs },
            context.tables,
          ),
        )
      }
      steps.push({
        index,
        command: adapted.command,
        status: adapted.kind === 'ported' ? 'compared' : 'not_ported',
        differences,
        python: seed0,
      })
    }
    return { result: { id: scenario.id, steps }, stopped: skipped }
  } catch (error) {
    return {
      result: {
        id: scenario.id,
        steps,
        error: error instanceof Error ? error.message : String(error),
      },
      stopped: skipped,
    }
  }
}

/** Python's `date.today()` where the Dono lives (risk R9). */
export const todayInSaoPaulo = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
    new Date(),
  )

export async function runReal(options: RealOptions): Promise<RealResult> {
  const started = Date.now()
  const base = join(options.work, 'base')
  const size = (path: string) => (existsSync(path) ? statSync(path).size : 0)
  const needed = size(options.source.database) * (1 + 3 * options.lanes) * 1.05
  mkdirSync(options.work, { recursive: true })
  if (freeBytes(options.work) < needed)
    throw new Error(
      `oracle --real: ${Math.ceil(needed / 1e9)} GB needed in ${options.work} (a database copy per lane and side)`,
    )
  try {
    await copySource(options.source, base)
    const people = readPeople(join(base, 'dados'))
    const scenarios = plan(
      {
        people: people.slugs,
        ...(people.owner !== undefined && { owner: people.owner }),
        moods: readMoods(),
        references: readReferences(join(base, DATABASE)),
      },
      {
        seed: options.seed,
        ...(options.count !== undefined && { count: options.count }),
      },
    )
    const tables = dataTables()
    const adapter = options.adapter ?? (await loadAdapter())
    const decisions = options.decisions ?? loadDecisions()
    const config = join(options.work, 'config')
    migrateConfig(join(ROOT, 'config'), config, 'to-en')
    rmSync(join(config, 'local.toml'), { force: true })
    const keys = Object.fromEntries(
      KEY_VARIABLES.flatMap((name) => {
        const value = process.env[name]
        return options.liveKeys && value ? [[name, value] as const] : []
      }),
    )
    const lanes = Array.from({ length: Math.max(1, options.lanes) }, (_, i) =>
      createLane(base, join(options.work, `lane${i}`)),
    )
    const results: ScenarioResult[] = Array.from({ length: scenarios.length })
    let next = 0
    let done = 0
    let stopped = 0
    const cacheBefore = cacheCounts(join(base, CACHE))
    const fetched: Record<string, number> = {}
    await Promise.all(
      lanes.map(async (lane) => {
        while (next < scenarios.length) {
          const i = next++
          const scenario = scenarios[i] as PlannedScenario
          const replayed = await replayReal(scenario, lane, {
            python: options.python,
            adapter,
            config,
            base,
            tables,
            today: options.today,
            selfCheck: options.selfCheck ?? true,
            keys,
          })
          results[i] = replayed.result
          for (const [source, n] of Object.entries(
            cacheCounts(join(lane.py0, CACHE)),
          ))
            if (n > (cacheBefore[source] ?? 0))
              fetched[source] =
                (fetched[source] ?? 0) + n - (cacheBefore[source] ?? 0)
          stopped += replayed.stopped
          options.onScenario?.(replayed.result, ++done, scenarios.length)
        }
      }),
    )
    const catalog = new DatabaseSync(join(base, DATABASE), { readOnly: true })
    const films = Number(
      catalog.prepare('SELECT count(*) AS n FROM filmes').get()?.['n'],
    )
    catalog.close()
    return {
      results,
      report: buildReport(results, decisions, {
        ported: adapter.ported,
        full: false,
        selfCheck: options.selfCheck ?? true,
      }),
      facts: {
        seed: options.seed,
        today: options.today,
        scenarios: scenarios.length,
        people: people.slugs.length,
        sessionsInData: sessionFiles(join(base, 'dados', 'sessoes')),
        films,
        dataTables: tables,
        keys: Object.keys(keys),
        cacheBefore,
        fetched,
        stopped,
        seconds: Math.round((Date.now() - started) / 1000),
      },
      private: people.names,
    }
  } finally {
    if (!options.keep) rmSync(options.work, { recursive: true, force: true })
  }
}
