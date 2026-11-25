import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  makeEngine,
  type ConsultResult,
  type ErrorCode,
  type Evaluation,
  type EvaluationProgress,
  type Outcome,
  type PushStatus,
} from '@filmes/engine'
import { describe, expect, it, vi } from 'vite-plus/test'
import { useFixture } from '../../../packages/engine/test/fixture.ts'
import { parseOperation } from '#/content/operations-form'
import {
  CONSULT_ROWS,
  consultAnswer,
  EvaluationRuns,
  evaluationPanel,
  latestReport,
  operationsAction,
  operationsFromEngine,
  operationsPage,
  pushAlert,
  type Operations,
  type Operator,
} from './operations'

const ADMIN: Operator = { name: 'Bruno', admin: true }
const DONO: Operator = { ...ADMIN, admin: false }

const ORIGIN = 'http://localhost'

const ok = <A>(output: A): Outcome<A> => ({ exitCode: 0, output })

const failure = (code: ErrorCode, message = `mensagem de ${code}`) =>
  ({ exitCode: 1, output: { error: { code, message } } }) as const

const STATUS: PushStatus = {
  enabled: true,
  pending: 0,
  failures: 0,
  failingSince: null,
  lastError: null,
  alert: false,
}

const MEASURES = {
  people: 4,
  retrieved: 2,
  heldOut4Plus: 5,
  withEvidence: 3,
  filmsTop5: 1,
  recall50: 0.4,
  coverageTop5: 0.25,
}

const EVALUATION = {
  date: '2026-11-20',
  offline: {
    people: MEASURES,
    movielens: { ...MEASURES, people: 0, recall50: null, coverageTop5: null },
  },
  online: {
    sessions: 0,
    withFilm: 0,
    chosenTop5: 0,
    rateTop5: null,
    reactions: 0,
    meanReaction: null,
  },
  priority: 'offline',
  weights: {},
  versions: {},
  warnings: ['sem MovieLens'],
  movielensSample: { seed: 1, users: 0 },
  file: '/var/avaliacoes/2026-11-20.md',
} satisfies Evaluation

/** Operations whose answers are given, for the page's logic. */
function fake(over: Partial<Operations> = {}): Operations {
  return {
    consult: async () => ok({ columns: [], rows: [] }),
    pushStatus: async () => ok(STATUS),
    push: async () => ok(STATUS),
    evaluationsFolder: async () => failure('missing_config'),
    evaluate: async () => ok(EVALUATION),
    ...over,
  }
}

/** An `evaluate` the test finishes by hand, after sending progress. */
function pendingEvaluation() {
  let finish: (outcome: Outcome<Evaluation>) => void = () => {}
  let listen: (event: EvaluationProgress) => void = () => {}
  const evaluate: Operations['evaluate'] = (_grid, l) => {
    listen = l
    return new Promise((resolve) => {
      finish = resolve
    })
  }
  return {
    evaluate,
    progress: (progress: number, message: string) =>
      listen({ progress, total: 100, message }),
    finish: (outcome: Outcome<Evaluation>) => finish(outcome),
  }
}

const post = (fields: Record<string, string>, origin = ORIGIN) => {
  const body = new FormData()
  for (const [k, v] of Object.entries(fields)) body.set(k, v)
  return new Request('http://localhost/operacoes/acao', {
    method: 'POST',
    headers: { origin },
    body,
  })
}

const NOW = () => new Date('2026-11-20T15:00:00Z')

describe('parseOperation', () => {
  const form = (fields: Record<string, string>) => {
    const f = new FormData()
    for (const [k, v] of Object.entries(fields)) f.set(k, v)
    return f
  }

  it('reads the evaluate and the push forms, and nothing else', () => {
    expect(parseOperation(form({ acao: 'avaliar' }))).toEqual({
      kind: 'evaluate',
      grid: false,
    })
    expect(parseOperation(form({ acao: 'avaliar', grade: 'sim' }))).toEqual({
      kind: 'evaluate',
      grid: true,
    })
    expect(parseOperation(form({ acao: 'enviar' }))).toEqual({ kind: 'push' })
    expect(parseOperation(form({ acao: 'apagar' }))).toBeUndefined()
    expect(parseOperation(form({}))).toBeUndefined()
  })
})

describe('the console', () => {
  it('cuts the table at CONSULT_ROWS and keeps the count', async () => {
    const rows = Array.from({ length: CONSULT_ROWS + 5 }, (_, i) => [i, null])
    const answer = await consultAnswer(
      fake({ consult: async () => ok({ columns: ['n', 'n'], rows }) }),
      'SELECT n, n FROM t',
    )
    if ('error' in answer) throw new Error('expected a table')
    expect(answer.total).toBe(CONSULT_ROWS + 5)
    expect(answer.rows).toHaveLength(CONSULT_ROWS)
    expect(answer.columns).toEqual([
      { key: 'c0', name: 'n' },
      { key: 'c1', name: 'n' },
    ])
    expect(answer.rows[1]).toEqual({
      key: 'r1',
      cells: [
        { key: 'c0', value: 1 },
        { key: 'c1', value: null },
      ],
    })
  })

  it('gives the engine’s refusal; only the unexpected goes to the log', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    for (const code of ['read_only', 'invalid_sql'] as const) {
      const answer = await consultAnswer(
        fake({ consult: async () => failure(code) }),
        'DELETE FROM x',
      )
      expect(answer).toEqual({
        sql: 'DELETE FROM x',
        error: { code, message: `mensagem de ${code}` },
      })
    }
    expect(log).not.toHaveBeenCalled()
    await consultAnswer(
      fake({ consult: async () => failure('missing_database') }),
      'SELECT 1',
    )
    expect(log).toHaveBeenCalledWith(
      'engine: missing_database: mensagem de missing_database',
    )
    log.mockRestore()
  })
})

describe('EvaluationRuns', () => {
  it('runs one at a time, with its progress, and keeps how it ended', async () => {
    const pending = pendingEvaluation()
    const runs = new EvaluationRuns(fake({ evaluate: pending.evaluate }), NOW)
    expect(runs.current).toEqual({ state: 'idle' })

    const run = runs.start('Bruno', true)
    expect(run).toBeInstanceOf(Promise)
    expect(runs.current).toMatchObject({
      state: 'running',
      by: 'Bruno',
      grid: true,
      progress: 0,
      startedAt: '2026-11-20T15:00:00.000Z',
    })
    pending.progress(35.5, 'Medindo recall e cobertura')
    expect(runs.current).toMatchObject({
      progress: 35.5,
      message: 'Medindo recall e cobertura',
    })
    expect(runs.start('Iara', false)).toBe('busy')

    pending.finish(
      ok({
        ...EVALUATION,
        grid: {
          values: {},
          combinations: 3,
          best: [{ recall50: 0.5, coverageTop5: 0.2 }, 'x'],
        },
      }),
    )
    await run
    expect(runs.current).toEqual({
      state: 'done',
      by: 'Bruno',
      grid: true,
      startedAt: '2026-11-20T15:00:00.000Z',
      finishedAt: '2026-11-20T15:00:00.000Z',
      result: {
        date: '2026-11-20',
        offline: EVALUATION.offline,
        online: EVALUATION.online,
        priority: 'offline',
        warnings: ['sem MovieLens'],
        best: [
          { recall50: 0.5, coverageTop5: 0.2 },
          { recall50: null, coverageTop5: null },
        ],
        file: '2026-11-20.md',
      },
    })
  })

  it('keeps the engine’s error when the run fails, and lets a new one start', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const evaluate = vi
      .fn<Operations['evaluate']>()
      .mockResolvedValueOnce(failure('missing_config', 'falta pasta'))
      .mockResolvedValueOnce(ok(EVALUATION))
    const runs = new EvaluationRuns(fake({ evaluate }), NOW)
    await runs.start('Bruno', false)
    expect(runs.current).toMatchObject({
      state: 'failed',
      error: { code: 'missing_config', message: 'falta pasta' },
    })
    expect(log).toHaveBeenCalledWith('engine: missing_config: falta pasta')
    await runs.start('Bruno', false)
    expect(runs.current).toMatchObject({
      state: 'done',
      result: { best: null },
    })
    log.mockRestore()
  })
})

describe('the page', () => {
  it('says the evaluation is not configured without FILMES_AVALIACOES', async () => {
    const ops = fake()
    const page = await operationsPage(ops, new EvaluationRuns(ops), undefined)
    expect(page).toEqual({
      push: STATUS,
      evaluation: { folder: 'unset', job: { state: 'idle' }, report: null },
      consult: null,
    })
  })

  it('shows the latest report of the folder', async () => {
    const folder = join(useFixture().root, 'avaliacoes')
    mkdirSync(folder)
    writeFileSync(join(folder, '2026-11-02.md'), 'velho')
    writeFileSync(join(folder, '2026-11-19.md'), 'novo')
    writeFileSync(join(folder, 'notas.txt'), 'outro')
    const ops = fake({ evaluationsFolder: async () => ok(folder) })
    expect(await evaluationPanel(ops, new EvaluationRuns(ops))).toEqual({
      folder: 'ready',
      job: { state: 'idle' },
      report: { date: '2026-11-19', text: 'novo' },
    })
    expect(latestReport(join(folder, 'nenhuma'))).toBeNull()
  })

  it('says what it cannot read when the engine cannot run', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const ops = fake({
      pushStatus: async () => failure('missing_config'),
      evaluationsFolder: async () => failure('invalid_config'),
      consult: async () => failure('missing_database'),
    })
    const page = await operationsPage(ops, new EvaluationRuns(ops), 'SELECT 1')
    expect(page.push).toBeNull()
    expect(page.evaluation.folder).toBe('unavailable')
    expect(page.consult).toMatchObject({ error: { code: 'missing_database' } })
    log.mockRestore()
  })

  it('shows the push banner only to an admin, and only on alert', async () => {
    const alert = { ...STATUS, failures: 3, alert: true }
    const failing = fake({ pushStatus: async () => ok(alert) })
    expect(await pushAlert(ADMIN, failing)).toEqual(alert)
    expect(await pushAlert(DONO, failing)).toBeNull()
    expect(await pushAlert(ADMIN, fake())).toBeNull()
    expect(
      await pushAlert(
        ADMIN,
        fake({ pushStatus: async () => failure('internal') }),
      ),
    ).toBeNull()
  })
})

describe('the form route', () => {
  const act = (
    request: Request,
    owner: Operator | null,
    ops: Operations = fake(),
    runs = new EvaluationRuns(ops),
  ) => operationsAction(request, owner, ops, runs, ORIGIN)

  const location = (response: Response) => response.headers.get('Location')

  it('takes only an admin Dono, from this site', async () => {
    expect(location(await act(post({ acao: 'enviar' }), null))).toBe('/entrar')
    expect(
      (await act(post({ acao: 'enviar' }, 'https://outro.example'), ADMIN))
        .status,
    ).toBe(403)
    const refused = await act(post({ acao: 'enviar' }), DONO)
    expect(refused.status).toBe(403)
    expect(await refused.text()).toBe('Só para admin')
    expect(location(await act(post({ acao: 'x' }), ADMIN))).toBe(
      '/operacoes?erro=pedido',
    )
  })

  it('pushes now', async () => {
    const push = vi.fn<Operations['push']>(async () => ok(STATUS))
    expect(
      location(await act(post({ acao: 'enviar' }), ADMIN, fake({ push }))),
    ).toBe('/operacoes?feito=enviado')
    expect(push).toHaveBeenCalledOnce()
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(
      location(
        await act(
          post({ acao: 'enviar' }),
          ADMIN,
          fake({ push: async () => failure('missing_data') }),
        ),
      ),
    ).toBe('/operacoes?erro=indisponivel')
    log.mockRestore()
  })

  it('starts the evaluation and answers before it ends', async () => {
    const pending = pendingEvaluation()
    const ops = fake({
      evaluationsFolder: async () => ok('/tmp/avaliacoes'),
      evaluate: pending.evaluate,
    })
    const runs = new EvaluationRuns(ops)
    expect(
      location(
        await act(post({ acao: 'avaliar', grade: 'sim' }), ADMIN, ops, runs),
      ),
    ).toBe('/operacoes?feito=avaliando')
    expect(runs.current).toMatchObject({
      state: 'running',
      by: 'Bruno',
      grid: true,
    })
    expect(
      location(await act(post({ acao: 'avaliar' }), ADMIN, ops, runs)),
    ).toBe('/operacoes?erro=em-andamento')
    pending.finish(ok(EVALUATION))
  })

  it('refuses the evaluation without a folder for the reports', async () => {
    expect(location(await act(post({ acao: 'avaliar' }), ADMIN))).toBe(
      '/operacoes?erro=sem-pasta',
    )
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(
      location(
        await act(
          post({ acao: 'avaliar' }),
          ADMIN,
          fake({ evaluationsFolder: async () => failure('invalid_config') }),
        ),
      ),
    ).toBe('/operacoes?erro=indisponivel')
    log.mockRestore()
  })
})

// --- the real engine -----------------------------------------------------------

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' })

describe('operationsFromEngine', () => {
  it('consults the fixture read-only', async () => {
    const fixture = useFixture()
    const engine = makeEngine(fixture.vars)
    try {
      const ops = operationsFromEngine(engine)
      const table = await consultAnswer(
        ops,
        "SELECT slug FROM pessoas WHERE slug IN ('bruno', 'iara') ORDER BY slug",
      )
      expect(table).toMatchObject({
        columns: [{ name: 'slug' }],
        total: 2,
        rows: [{ cells: [{ value: 'bruno' }] }, { cells: [{ value: 'iara' }] }],
      })
      expect(await consultAnswer(ops, 'DELETE FROM pessoas')).toMatchObject({
        error: { code: 'read_only' },
      })
      const result: Outcome<ConsultResult> = await ops.consult('SELEC')
      expect(result).toMatchObject({
        output: { error: { code: 'invalid_sql' } },
      })
    } finally {
      await engine.dispose()
    }
  })

  it('evaluates the fixture with progress, and writes the report', async () => {
    const fixture = useFixture()
    const folder = join(fixture.root, 'avaliacoes')
    const engine = makeEngine({ ...fixture.vars, FILMES_AVALIACOES: folder })
    try {
      const ops = operationsFromEngine(engine)
      const runs = new EvaluationRuns(ops)
      const seen: number[] = []
      const watched: Operations = {
        ...ops,
        evaluate: (grid, listen) =>
          ops.evaluate(grid, (event) => {
            seen.push(event.progress)
            listen(event)
          }),
      }
      await new EvaluationRuns(watched).start('Bruno', false)
      expect(seen[0]).toBe(0)
      expect(seen.at(-1)).toBe(100)
      const panel = await evaluationPanel(ops, runs)
      expect(panel.folder).toBe('ready')
      expect(panel.report?.date).toBe('2026-11-20')
      expect(panel.report?.text).toContain('Recall@50')
    } finally {
      await engine.dispose()
    }
  })

  it('reads the push queue, and the alert after three failures', async () => {
    const fixture = useFixture()
    git(fixture.data, 'init', '--quiet', '-b', 'master')
    git(fixture.data, 'add', '--all')
    git(
      fixture.data,
      '-c',
      'user.name=fixture',
      '-c',
      'user.email=fixture@example.org',
      'commit',
      '--quiet',
      '-m',
      'initial',
    )
    const engine = makeEngine({
      ...fixture.vars,
      FILMES_DATA_REMOTE: join(fixture.root, 'nowhere.git'),
    })
    try {
      const ops = operationsFromEngine(engine)
      for (let i = 0; i < 3; i++) await ops.push()
      const alert = await pushAlert(ADMIN, ops)
      expect(alert).toMatchObject({ enabled: true, alert: true })
      expect(alert?.failures).toBeGreaterThanOrEqual(3)
      expect(alert?.lastError).toMatch(/git push exited with/)
    } finally {
      await engine.dispose()
    }
  })
})
