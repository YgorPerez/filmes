// @vitest-environment jsdom
// Operações as an admin uses it: the console's form and what it shows for
// each answer, the evaluation's states and its live progress, the push's
// card and the banner of the Dono pages.
import type { PushStatus } from '@filmes/engine'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  OPERATIONS_NOTICES,
  OPERATIONS_REFUSALS,
  parseOperation,
} from '#/content/operations-form'
import type {
  ConsultAnswer,
  EvaluationJob,
  EvaluationPanel,
  OperationsPage,
} from '#/platform/operations'
import { Operations } from './operations'
import { OPERATIONS } from './operations.copy'
import { PushBanner } from './operations-push'
import { EvaluationSection } from './operations-evaluation'

afterEach(cleanup)

const STATUS: PushStatus = {
  enabled: true,
  pending: 0,
  failures: 0,
  failingSince: null,
  lastError: null,
  alert: false,
}

const IDLE: EvaluationPanel = {
  folder: 'ready',
  job: { state: 'idle' },
  report: null,
}

const page = (over: Partial<OperationsPage> = {}): OperationsPage => ({
  push: STATUS,
  evaluation: IDLE,
  consult: null,
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
    },
    priority: 'offline',
    warnings: ['A amostra offline do MovieLens exige ml-32m.'],
    best: [{ recall50: 0.5, coverageTop5: null }],
    file: '2026-11-20.md',
  },
}

const RUNNING: EvaluationJob = {
  state: 'running',
  by: 'Bruno',
  grid: false,
  startedAt: '2026-11-20T15:00:00.000Z',
  progress: 35.5,
  message: 'Medindo recall e cobertura',
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
      '250 linhas; mostrando as primeiras 2.',
    )
  })

  it('says when the query brought nothing', () => {
    show(
      page({
        consult: { sql: 'SELECT 1 WHERE 0', columns: [], rows: [], total: 0 },
      }),
    )
    expect(screen.getByText(OPERATIONS.consult.empty)).toBeTruthy()
  })

  it.each([
    ['read_only', 'Só leitura: o console aceita só SELECT.'],
    ['invalid_sql', 'SQL inválido.'],
  ])('says why it refused the query: %s', (code, text) => {
    show(
      page({
        consult: { sql: 'DROP TABLE x', error: { code, message: 'near "x"' } },
      }),
    )
    const alert = within(region(OPERATIONS.consult.title)).getByRole('alert')
    expect(alert.textContent).toContain(text)
    expect(alert.textContent).toContain(code)
    expect(alert.textContent).toContain('near "x"')
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
    await userEvent.click(within(area).getByLabelText(/pesos da grade/))
    const button = within(area).getByRole('button', { name: 'Avaliar' })
    const form = button.closest('form')!
    expect(form.getAttribute('action')).toBe('/operacoes/acao')
    expect(parseOperation(new FormData(form))).toEqual({
      kind: 'evaluate',
      grid: true,
    })
    expect(within(area).getByText(OPERATIONS.evaluation.noReport)).toBeTruthy()
  })

  it('says it is not configured without a folder for the reports', () => {
    show(page({ evaluation: { ...IDLE, folder: 'unset' } }))
    const area = region(OPERATIONS.evaluation.title)
    expect(within(area).getByRole('alert').textContent).toContain(
      'FILMES_AVALIACOES',
    )
    expect(within(area).queryByRole('button')).toBeNull()
  })

  it('says when the engine cannot run here', () => {
    show(page({ evaluation: { ...IDLE, folder: 'unavailable' } }))
    expect(
      within(region(OPERATIONS.evaluation.title)).getByRole('alert')
        .textContent,
    ).toBe(`⚠${OPERATIONS.evaluation.unavailable}`)
  })

  it('shows the progress while it runs, and no second run', () => {
    show(page({ evaluation: { ...IDLE, job: RUNNING } }))
    const area = region(OPERATIONS.evaluation.title)
    expect(
      within(area).getByRole('progressbar', { name: 'Progresso da avaliação' }),
    ).toHaveProperty('value', 35.5)
    expect(
      within(area).getByText('35% · Medindo recall e cobertura'),
    ).toBeTruthy()
    expect(within(area).getByText(/iniciada por Bruno/)).toBeTruthy()
    expect(
      within(area).getByRole('button', { name: 'Avaliando…' }),
    ).toHaveProperty('disabled', true)
  })

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
        report: { date: '2026-11-20', text: '# Avaliação' },
      })
    render(
      <EvaluationSection
        initial={{ ...IDLE, job: RUNNING }}
        read={read}
        pollMs={0}
      />,
    )
    expect(await screen.findByText(/Gravando o relatório/)).toBeTruthy()
    expect(
      await screen.findByText(/Relatório gravado em 2026-11-20\.md/),
    ).toBeTruthy()
    expect(read).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Relatório de 2026-11-20')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Avaliar' })).toHaveProperty(
      'disabled',
      false,
    )
  })

  it('shows the measures of the run that ended', () => {
    show(page({ evaluation: { ...IDLE, job: DONE } }))
    const area = region(OPERATIONS.evaluation.title)
    const [measures, best] = within(area).getAllByRole('table')
    expect(
      within(measures!)
        .getAllByRole('row')
        .map((r) => r.textContent),
    ).toEqual([
      'AmostraMedidasRecall@50Cobertura no top 5',
      'Pessoas440%25%',
      'MovieLens0——',
    ])
    expect(
      within(best!)
        .getAllByRole('row')
        .slice(1)
        .map((r) => r.textContent),
    ).toEqual(['1º50%—'])
    expect(
      within(area).getByText('Feedback de 1 Sessão; escolhido no top 5: 100%.'),
    ).toBeTruthy()
    expect(within(area).getByText(/ml-32m/)).toBeTruthy()
    expect(within(area).getByText(/poucas Sessões/)).toBeTruthy()
  })

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
    ).toContain('(missing_config): falta a pasta')
  })
})

describe('the push', () => {
  it('shows the queue and offers a push now', () => {
    show(page({ push: { ...STATUS, pending: 2 } }))
    const area = region(OPERATIONS.push.title)
    expect(
      within(area).getByText('2 commits na fila para enviar.'),
    ).toBeTruthy()
    const form = within(area)
      .getByRole('button', { name: 'Tentar enviar agora' })
      .closest('form')!
    expect(parseOperation(new FormData(form))).toEqual({ kind: 'push' })
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
        },
      }),
    )
    const area = region(OPERATIONS.push.title)
    expect(within(area).getByRole('alert').textContent).toContain(
      'falhou 3 vezes seguidas; 1 commit esperando',
    )
    expect(within(area).getByText('3 falhas seguidas.')).toBeTruthy()
    expect(within(area).getByText(/^Falhando desde/)).toBeTruthy()
    expect(within(area).getByText('git push exited with 128')).toBeTruthy()
  })

  it('says when pushing is off, or cannot be read', () => {
    show(page({ push: { ...STATUS, enabled: false } }))
    expect(
      within(region(OPERATIONS.push.title)).getByText(OPERATIONS.push.off),
    ).toBeTruthy()
    expect(
      within(region(OPERATIONS.push.title)).queryByRole('button'),
    ).toBeNull()
    cleanup()
    show(page({ push: null }))
    expect(
      within(region(OPERATIONS.push.title)).getByRole('alert').textContent,
    ).toContain(OPERATIONS.push.unavailable)
  })

  it('has a banner for the other pages, with a link here', () => {
    render(
      <PushBanner
        status={{ ...STATUS, pending: 4, failures: 5, alert: true }}
      />,
    )
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('falhou 5 vezes seguidas; 4 commits')
    expect(
      within(alert).getByRole('link', { name: 'Ver Operações' }),
    ).toHaveProperty('pathname', '/operacoes')
  })
})

describe('the page', () => {
  it.each(OPERATIONS_NOTICES)('says what a form did: %s', (notice) => {
    show(page(), { notice })
    expect(screen.getAllByRole('status')[0]!.textContent).toBe(
      OPERATIONS.notices[notice],
    )
  })

  it.each(OPERATIONS_REFUSALS)('says why a form did nothing: %s', (refusal) => {
    show(page(), { refusal })
    expect(screen.getAllByRole('alert')[0]!.textContent).toContain(
      OPERATIONS.refusals[refusal],
    )
  })
})
