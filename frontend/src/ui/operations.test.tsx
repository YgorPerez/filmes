// @vitest-environment jsdom
// Operações as an admin uses it: the console's form and what it shows for
// each answer, the evaluation's states and its live progress, and the push's
// card. The banner of the Dono pages is the shell's (`shell.test.tsx`).
import type { PushStatus } from '@filmes/engine'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { OPERATIONS_REFUSALS, parseOperation } from '#/content/operations-form'
import type {
  ConsultAnswer,
  EvaluationJob,
  EvaluationPanel,
  EvaluationSummary,
  OperationsPage,
} from '#/platform/operations'
import { Operations } from './operations'
import { OPERATIONS } from './operations.copy'
import { EvaluationSection } from './operations-evaluation'

afterEach(cleanup)

const STATUS: PushStatus = {
  enabled: true,
  pending: 0,
  failures: 0,
  failingSince: null,
  lastError: null,
  alert: false,
  lastPushedAt: null,
  queued: [],
}

const IDLE: EvaluationPanel = {
  folder: 'ready',
  job: { state: 'idle' },
  report: null,
  previous: null,
}

const page = (over: Partial<OperationsPage> = {}): OperationsPage => ({
  push: STATUS,
  evaluation: IDLE,
  consult: null,
  schema: [{ name: 'filmes', kind: 'table', columns: ['id', 'titulo'] }],
  ...over,
})

const never = () => new Promise<EvaluationPanel>(() => {})

const show = (
  p: OperationsPage,
  extra: Partial<Parameters<typeof Operations>[0]> = {},
) => render(<Operations page={p} readEvaluation={never} {...extra} />)

const region = (name: string) => screen.getByRole('region', { name })

const MEASURES = {
  people: 4,
  retrieved: 2,
  heldOut4Plus: 5,
  withEvidence: 3,
  filmsTop5: 1,
  recall50: 0.4,
  coverageTop5: 0.25,
  calibration: {
    overall: {
      weak: { heldOut: 0, hits: 0, hitRate: null },
      moderate: { heldOut: 0, hits: 0, hitRate: null },
      strong: { heldOut: 1, hits: 1, hitRate: 1 },
      none: { heldOut: 0, hits: 0, hitRate: null },
      rises: null,
    },
    people: {},
  },
  predictedRatingError: {
    films: 0,
    meanAbsoluteError: null,
    rawMeanAbsoluteError: null,
  },
  similarityTop5: null,
}

const DONE: EvaluationJob = {
  state: 'done',
  by: 'Bruno',
  grid: true,
  startedAt: '2026-11-20T15:00:00.000Z',
  finishedAt: '2026-11-20T15:01:00.000Z',
  result: {
    date: '2026-11-20',
    offline: {
      people: MEASURES,
      movielens: { ...MEASURES, people: 0, recall50: null, coverageTop5: null },
    },
    online: {
      sessions: 1,
      withFilm: 1,
      chosenTop5: 1,
      rateTop5: 1,
      reactions: 1,
      meanReaction: 1,
      satisfaction: {
        people: {},
        groupSessions: 0,
        minimum: null,
        disagreement: null,
      },
    },
    priority: 'offline',
    warnings: ['A amostra offline do MovieLens exige ml-32m.'],
    best: [
      {
        recall50: 0.5,
        coverageTop5: null,
        changes: [
          { section: 'path.weight', key: 'cast', from: 0.5, to: 0.625 },
        ],
        tie: false,
      },
      { recall50: 0.4, coverageTop5: null, changes: [], tie: false },
    ],
    combinations: 411,
    file: '2026-11-20.md',
  },
}

const RUNNING: EvaluationJob = {
  state: 'running',
  by: 'Bruno',
  grid: false,
  startedAt: '2026-11-20T15:00:00.000Z',
  progress: 35.5,
  message: 'Medindo o quanto a lista acerta',
}

describe('the console', () => {
  it('sends the SQL as a plain GET of the page', async () => {
    show(page())
    const area = region(OPERATIONS.consult.title)
    const sql = within(area).getByLabelText('SQL')
    await userEvent.type(sql, 'SELECT 1')
    const form = sql.closest('form')!
    expect(form.getAttribute('method')).toBe('get')
    expect(form.getAttribute('action')).toBe('/operacoes')
    expect(new FormData(form).get('sql')).toBe('SELECT 1')
    expect(
      within(area).getByRole('button', { name: 'Consultar' }),
    ).toHaveProperty('type', 'submit')
  })
})

describe('the console, the table', () => {
  it('shows the table, NULL apart, and how many rows came', () => {
    const answer: ConsultAnswer = {
      sql: 'SELECT slug, apelido FROM pessoas',
      columns: [
        { key: 'c0', name: 'slug' },
        { key: 'c1', name: 'apelido' },
      ],
      rows: [
        {
          key: 'r0',
          cells: [
            { key: 'c0', value: 'bruno' },
            { key: 'c1', value: null },
          ],
        },
        {
          key: 'r1',
          cells: [
            { key: 'c0', value: 'iara' },
            { key: 'c1', value: 7 },
          ],
        },
      ],
      total: 250,
      limit: 2,
    }
    show(page({ consult: answer }))
    const area = region(OPERATIONS.consult.title)
    expect(within(area).getByLabelText('SQL')).toHaveProperty(
      'value',
      answer.sql,
    )
    const table = within(area).getByRole('table')
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual(['slug', 'apelido'])
    expect(
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.textContent),
    ).toEqual(['brunoNULL', 'iara7'])
    expect(within(area).getByRole('status').textContent).toBe(
      'Mostrando as primeiras 2 de 250 linhas. Use LIMIT e OFFSET para ver o resto.',
    )
  })
})

describe('the console, a table wider than the card', () => {
  const WIDE: ConsultAnswer = {
    sql: 'SELECT * FROM arestas',
    columns: ['fato_id', 'filme_id', 'predicado', 'alvo'].map((name, i) => ({
      key: `c${i}`,
      name,
    })),
    rows: [],
    total: 0,
    limit: 200,
  }

  // jsdom lays nothing out: the widths are the browser's at 390px.
  const widths = (scroll: number, client: number) => {
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(
      scroll,
    )
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(
      client,
    )
  }
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('says the table scrolls sideways', () => {
    widths(900, 340)
    show(page({ consult: WIDE }))
    expect(
      within(region(OPERATIONS.consult.title)).getByText(
        OPERATIONS.consult.sideways(4),
      ),
    ).toBeTruthy()
  })

  it('says nothing when the columns fit', () => {
    widths(340, 340)
    show(page({ consult: WIDE }))
    expect(screen.queryByText(OPERATIONS.consult.sideways(4))).toBeNull()
  })
})

describe('the console, cells, empty answers and tables', () => {
  it('wraps a long cell at its words, in a column of its own', () => {
    const long = 'palavra '.repeat(8).trim()
    show(
      page({
        consult: {
          sql: 'SELECT t',
          columns: [{ key: 'c0', name: 't' }],
          rows: [{ key: 'r0', cells: [{ key: 'c0', value: long }] }],
          total: 1,
          limit: 200,
        },
      }),
    )
    expect(screen.getByText(long).className).toContain('w-[32ch]')
  })

  it('says when the query brought nothing, under its columns', () => {
    show(
      page({
        consult: {
          sql: 'SELECT id FROM filmes WHERE 0',
          columns: [{ key: 'c0', name: 'id' }],
          rows: [],
          total: 0,
          limit: 200,
        },
      }),
    )
    expect(screen.getByRole('status').textContent).toBe(
      OPERATIONS.consult.empty,
    )
    expect(screen.getByRole('columnheader').textContent).toBe('id')
  })

  it('lists the tables, each a link to its first rows, and ready queries', () => {
    show(page())
    const area = region(OPERATIONS.consult.title)
    expect(within(area).getByText('Tabelas e visões (1)')).toBeTruthy()
    expect(
      within(area).getByRole('link', { name: 'filmes' }).getAttribute('href'),
    ).toBe(
      `/operacoes?sql=${encodeURIComponent('SELECT * FROM filmes LIMIT 20')}#consultar`,
    )
    expect(within(area).getByText('id, titulo')).toBeTruthy()
    const ready = within(area).getByRole('navigation', {
      name: OPERATIONS.consult.saved,
    })
    expect(within(ready).getAllByRole('link')).toHaveLength(
      OPERATIONS.consult.queries.length,
    )
  })
})

describe('the console, refusals and errors', () => {
  it.each([
    ['read_only', 'O console só lê o banco. Use um SELECT.'],
    ['invalid_sql', 'O banco recusou o SQL.'],
  ])('says why it refused the query: %s', (code, text) => {
    show(
      page({
        consult: { sql: 'DROP TABLE x', error: { code, message: 'near "x"' } },
      }),
    )
    const alert = within(region(OPERATIONS.consult.title)).getByRole('alert')
    expect(alert.textContent).toContain(text)
    expect(alert.textContent).toContain(code)
    expect(alert.textContent?.includes('near "x"')).toBe(code === 'invalid_sql')
  })

  it('does not show an unexpected error’s message', () => {
    show(
      page({
        consult: {
          sql: 'SELECT 1',
          error: { code: 'missing_database', message: '/data/db/x.sqlite' },
        },
      }),
    )
    const alert = within(region(OPERATIONS.consult.title)).getByRole('alert')
    expect(alert.textContent).toContain(OPERATIONS.consult.other)
    expect(alert.textContent).toContain('missing_database')
    expect(alert.textContent).not.toContain('/data/db')
  })
})

describe('the evaluation', () => {
  it('runs from a form, with the grid as a choice', async () => {
    show(page())
    const area = region(OPERATIONS.evaluation.title)
    await userEvent.click(within(area).getByLabelText(/combinações de pesos/))
    const button = within(area).getByRole('button', { name: 'Avaliar' })
    const form = button.closest('form')!
    expect(form.getAttribute('action')).toBe('/operacoes/acao')
    expect(parseOperation(new FormData(form))).toEqual({
      kind: 'evaluate',
      grid: true,
    })
    expect(within(area).getByText(OPERATIONS.evaluation.noReport)).toBeTruthy()
  })

  it('says it is not configured without a folder for the reports, and names the setting', () => {
    show(page({ evaluation: { ...IDLE, folder: 'unset' } }))
    const area = region(OPERATIONS.evaluation.title)
    const alert = within(area).getByRole('alert').textContent
    expect(alert).toContain('Configure a pasta de relatórios no servidor')
    expect(alert).toContain('FILMES_AVALIACOES')
    expect(within(area).queryByRole('button')).toBeNull()
  })

  it('says when the engine cannot run here', () => {
    show(page({ evaluation: { ...IDLE, folder: 'unavailable' } }))
    expect(
      within(region(OPERATIONS.evaluation.title)).getByRole('alert')
        .textContent,
    ).toBe(OPERATIONS.evaluation.unavailable)
  })

  it('shows the progress while it runs, and no second run', () => {
    show(page({ evaluation: { ...IDLE, job: RUNNING } }))
    const area = region(OPERATIONS.evaluation.title)
    expect(
      within(area).getByRole('progressbar', { name: 'Progresso da avaliação' }),
    ).toHaveProperty('value', 35.5)
    expect(within(area).getByText('35%')).toBeTruthy()
    expect(
      within(area).getByText('Medindo o quanto a lista acerta'),
    ).toBeTruthy()
    expect(within(area).getByText(/Bruno iniciou/)).toBeTruthy()
    expect(within(area).queryByRole('button', { name: 'Avaliar' })).toBeNull()
  })
})

describe('the evaluation, following the run', () => {
  it('follows the run until it ends', async () => {
    const read = vi
      .fn<() => Promise<EvaluationPanel>>()
      .mockResolvedValueOnce({
        ...IDLE,
        job: { ...RUNNING, progress: 96, message: 'Gravando o relatório' },
      })
      .mockResolvedValueOnce({
        ...IDLE,
        job: DONE,
        report: { date: '2026-11-20', text: '# Avaliação', names: {} },
      })
    render(
      <EvaluationSection
        initial={{ ...IDLE, job: RUNNING }}
        read={read}
        pollMs={0}
      />,
    )
    expect(await screen.findByText(/Gravando o relatório/)).toBeTruthy()
    expect(await screen.findByText(/^Terminou em 20 nov 2026/)).toBeTruthy()
    expect(read).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Relatório de 20 nov 2026')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Avaliar' })).toHaveProperty(
      'disabled',
      false,
    )
  })
})

describe('the evaluation, the focus when the run ends', () => {
  const FAILED: EvaluationJob = {
    state: 'failed',
    by: 'Bruno',
    grid: false,
    startedAt: RUNNING.startedAt,
    finishedAt: RUNNING.startedAt,
    error: { code: 'missing_config', message: 'falta a pasta' },
  }

  const follow = (end: EvaluationJob) =>
    render(
      <EvaluationSection
        initial={{ ...IDLE, job: RUNNING }}
        read={async () => ({ ...IDLE, job: end })}
        pollMs={0}
        started
      />,
    )

  it('gives the verdict the focus the progress had', async () => {
    follow(DONE)
    await screen.findByText(/^Terminou em/)
    expect(document.activeElement?.textContent).toBe(
      'A lista acerta 40% das Notas altas reservadas, com 4 Pessoas.',
    )
  })

  it('gives why the run stopped the focus', async () => {
    follow(FAILED)
    await screen.findByRole('alert')
    expect(document.activeElement?.textContent).toContain(
      OPERATIONS.evaluation.failed,
    )
  })

  it('leaves a focus the admin moved elsewhere', async () => {
    render(
      <>
        <button type="button">fora</button>
        <EvaluationSection
          initial={{ ...IDLE, job: RUNNING }}
          read={async () => ({ ...IDLE, job: DONE })}
          pollMs={0}
          started
        />
      </>,
    )
    screen.getByRole('button', { name: 'fora' }).focus()
    await screen.findByText(/^Terminou em/)
    expect(document.activeElement?.textContent).toBe('fora')
  })

  it('takes no focus for a run that had ended before the page', () => {
    show(page({ evaluation: { ...IDLE, job: DONE } }))
    expect(document.activeElement).toBe(document.body)
  })
})

describe('the evaluation, the measures', () => {
  it('shows the measures of the run that ended', () => {
    show(page({ evaluation: { ...IDLE, job: DONE } }))
    const area = region(OPERATIONS.evaluation.title)
    const [measures, best] = within(area).getAllByRole('table')
    expect(
      within(measures!)
        .getAllByRole('row')
        .map((r) => r.textContent),
    ).toEqual([
      'AmostraPessoasRecall@50Cobertura no top 5',
      'Pessoas440%25%',
      `MovieLens0${OPERATIONS.evaluation.noMovielens}`,
    ])
    expect(
      within(best!)
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.textContent),
    ).toEqual([
      '1ºelenco 0,5 → 0,625Copiar pesos50%—',
      '2ºos pesos de hojeatual40%—',
    ])
    expect(
      within(area).getByText(
        'Só a 1ª das 411 combinações testadas supera os pesos de hoje.',
      ),
    ).toBeTruthy()
    expect(within(area).getByText('Feedback das Sessões')).toBeTruthy()
    expect(
      within(area).getByText(
        'A lista acerta 40% das Notas altas reservadas, com 4 Pessoas.',
      ),
    ).toBeTruthy()
    expect(within(area).getByText(/Amostra pequena/)).toBeTruthy()
    expect(
      within(area).getByText(
        'Feedback de 1 Sessão. O filme escolhido estava no top 5 em 100% delas.',
      ),
    ).toBeTruthy()
    // The MovieLens warning is in its row, not again in a list.
    expect(within(area).queryByRole('listitem')).toBeNull()
    expect(within(area).getByText(/poucas Sessões/)).toBeTruthy()
  })

  it('says the change since the report before', () => {
    show(
      page({
        evaluation: {
          ...IDLE,
          job: DONE,
          previous: { date: '2026-11-13', recall50: 0.35 },
        },
      }),
    )
    expect(screen.getByText('+5 pontos desde 13 nov 2026.')).toBeTruthy()
  })
})

describe('the evaluation, whether the grid beats today', () => {
  const grid = (
    best: EvaluationSummary['best'],
    combinations: number | null = 411,
  ) => {
    if (DONE.state !== 'done') throw new Error('DONE is done')
    const job = { ...DONE, result: { ...DONE.result, best, combinations } }
    show(page({ evaluation: { ...IDLE, job } }))
    return region(OPERATIONS.evaluation.title)
  }
  const CHANGE = [{ section: 'path.weight', key: 'cast', from: 0.5, to: 0.375 }]

  it('says when nothing beats today, and offers no copy', () => {
    const area = grid([
      { recall50: 0.8, coverageTop5: 0.7, changes: [], tie: true },
      { recall50: 0.8, coverageTop5: 0.7, changes: CHANGE, tie: true },
    ])
    expect(
      within(area).getByText(
        'Nenhuma das 411 combinações testadas supera os pesos de hoje.',
      ),
    ).toBeTruthy()
    expect(within(area).getByText('sem ganho')).toBeTruthy()
    // Below today's weights a tie says nothing "sem ganho" does not.
    expect(within(area).queryByText('empate')).toBeNull()
    expect(
      within(area).queryByRole('button', { name: /Copiar os pesos/ }),
    ).toBeNull()
  })

  it('marks a tie only between sets that beat today', () => {
    const area = grid([
      { recall50: 0.9, coverageTop5: 0.7, changes: CHANGE, tie: true },
      { recall50: 0.9, coverageTop5: 0.7, changes: CHANGE, tie: true },
      { recall50: 0.8, coverageTop5: 0.7, changes: [], tie: false },
    ])
    expect(within(area).getAllByText('empate')).toHaveLength(2)
    expect(within(area).getByText('atual')).toBeTruthy()
  })

  it('says how many beat today, with today among the best or not', () => {
    grid(
      [
        { recall50: 0.9, coverageTop5: 0.7, changes: CHANGE, tie: false },
        { recall50: 0.85, coverageTop5: 0.7, changes: CHANGE, tie: false },
        { recall50: 0.8, coverageTop5: 0.7, changes: [], tie: false },
      ],
      null,
    )
    expect(
      screen.getByText(
        'As 2 primeiras das combinações testadas superam os pesos de hoje.',
      ),
    ).toBeTruthy()
    cleanup()
    grid([{ recall50: 0.9, coverageTop5: 0.7, changes: CHANGE, tie: false }])
    expect(
      screen.getByText(
        'A melhor das 411 combinações testadas supera os pesos de hoje.',
      ),
    ).toBeTruthy()
  })
})

describe('the evaluation, the weights, the report and the focus', () => {
  it('copies a better weight set as TOML', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {})
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })
    show(page({ evaluation: { ...IDLE, job: DONE } }))
    await userEvent.click(
      screen.getByRole('button', { name: 'Copiar os pesos da 1ª combinação' }),
    )
    expect(writeText).toHaveBeenCalledWith('[path.weight]\ncast = 0.625')
    expect(await screen.findByText('Copiado.')).toBeTruthy()
  })

  it('shows the report in sections, with the file to keep', () => {
    show(
      page({
        evaluation: {
          ...IDLE,
          report: {
            date: '2026-11-20',
            text: '# Avaliação\n\n## Offline\n\n| A | B |\n| --- | ---: |\n| Pessoas | 0.27708333333333335 |\n\n## Avisos\n\n- sem MovieLens\n',
            names: {},
          },
        },
      }),
    )
    const area = region(OPERATIONS.evaluation.title)
    expect(
      within(area).getByRole('heading', { name: 'Relatório de 20 nov 2026' }),
    ).toBeTruthy()
    expect(within(area).getByRole('cell', { name: '0,28' })).toBeTruthy()
    expect(within(area).getByText('Avisos')).toBeTruthy()
    // The summary is the answer: every fold of the report starts closed.
    expect(
      [...area.querySelectorAll('details')].map((fold) => fold.open),
    ).toEqual([false, false])
    expect(
      within(area)
        .getByRole('link', { name: OPERATIONS.evaluation.download })
        .getAttribute('href'),
    ).toBe('/operacoes/relatorio.md?data=2026-11-20')
  })

  it('takes the focus to the progress just after Avaliar', () => {
    show(page({ evaluation: { ...IDLE, job: RUNNING } }), {
      notice: 'avaliando',
    })
    expect(document.activeElement?.textContent).toContain(
      'Medindo o quanto a lista acerta',
    )
  })
})

describe('the evaluation, a run that stopped', () => {
  it('says why the run stopped', () => {
    show(
      page({
        evaluation: {
          ...IDLE,
          job: {
            state: 'failed',
            by: 'Bruno',
            grid: false,
            startedAt: RUNNING.startedAt,
            finishedAt: RUNNING.startedAt,
            error: { code: 'missing_config', message: 'falta a pasta' },
          },
        },
      }),
    )
    expect(
      within(region(OPERATIONS.evaluation.title)).getByRole('alert')
        .textContent,
    ).toContain('missing_config (falta a pasta)')
  })
})

describe('the push', () => {
  it('shows the queue and offers a push now', () => {
    show(page({ push: { ...STATUS, pending: 2 } }))
    const area = region(OPERATIONS.push.title)
    expect(within(area).getByText('2 commits na fila.')).toBeTruthy()
    const form = within(area)
      .getByRole('button', { name: 'Tentar enviar agora' })
      .closest('form')!
    expect(parseOperation(new FormData(form))).toEqual({ kind: 'push' })
  })

  it('shows a failed retry in the queue, even after a single failure', () => {
    show(page({ push: { ...STATUS, pending: 1, failures: 1 } }), {
      notice: 'enviado',
    })
    const area = region(OPERATIONS.push.title)
    expect(within(area).getByRole('alert').textContent).toContain(
      OPERATIONS.push.failing,
    )
    expect(within(area).getByText('1 commit na fila.')).toBeTruthy()
    expect(within(area).getByText(OPERATIONS.push.nextStep)).toBeTruthy()
  })

  it('warns after three failures, with git’s last error', () => {
    show(
      page({
        push: {
          enabled: true,
          pending: 1,
          failures: 3,
          failingSince: '2026-11-20T15:00:00.000Z',
          lastError: 'git push exited with 128',
          alert: true,
          lastPushedAt: null,
          queued: ['Bruno deu nota a Fronteira (2008)'],
        },
      }),
    )
    const area = region(OPERATIONS.push.title)
    expect(within(area).getByRole('alert').textContent).toMatch(
      /^O envio dos dados está falhando3 falhas seguidas\. A primeira falha foi em 20 nov 2026, 12:00\.$/,
    )
    expect(within(area).getByText('1 commit na fila:')).toBeTruthy()
    expect(
      within(area).getByText('Bruno deu nota a Fronteira (2008)').tagName,
    ).toBe('CODE')
    expect(within(area).getByText('git push exited with 128')).toBeTruthy()
    // While it fails, the retry is the page's orange button, not Consultar.
    expect(
      [...document.querySelectorAll('button.bg-sticker-orange')].map(
        (b) => b.textContent,
      ),
    ).toEqual(['Tentar enviar agora'])
    // It comes first, before the console.
    const sections = screen
      .getAllByRole('region')
      .map((r) => r.id || r.getAttribute('aria-labelledby'))
    expect(sections.indexOf('envio')).toBeLessThan(
      sections.indexOf('consultar'),
    )
  })
})

describe('the push, a clear queue and pushing off', () => {
  it('shows that the queue is clear after a successful retry', () => {
    show(page({ push: { ...STATUS, lastPushedAt: '2026-11-20T15:00:00Z' } }), {
      notice: 'enviado',
    })
    const area = region(OPERATIONS.push.title)
    expect(within(area).getByRole('status').textContent).toBe(
      'Em dia · último envio em 20 nov 2026, 12:00.',
    )
  })

  it('does not report an empty queue when Git could not count the commits', () => {
    show(page({ push: { ...STATUS, lastError: 'not a git repository' } }))
    const area = region(OPERATIONS.push.title)
    expect(within(area).getByRole('alert').textContent).toContain(
      'Não foi possível ler a fila de envio.',
    )
    expect(within(area).queryByText(/Em dia/)).toBeNull()
  })

  it('says when pushing is off, or cannot be read', () => {
    show(page({ push: { ...STATUS, enabled: false } }))
    const off = within(region(OPERATIONS.push.title)).getByText(
      /O envio está desligado/,
    ).textContent
    expect(off).toContain(OPERATIONS.push.off)
    expect(off).toContain('FILMES_DATA_REMOTE')
    expect(
      within(region(OPERATIONS.push.title)).queryByRole('button'),
    ).toBeNull()
    cleanup()
    show(page({ push: null }))
    expect(
      within(region(OPERATIONS.push.title)).getByRole('alert').textContent,
    ).toContain(OPERATIONS.push.unavailable)
  })
})

describe('the page', () => {
  it.each(OPERATIONS_REFUSALS)('says why a form did nothing: %s', (refusal) => {
    show(page(), { refusal })
    expect(screen.getAllByRole('alert')[0]!.textContent).toContain(
      OPERATIONS.refusals[refusal],
    )
  })
})
