import { execFileSync } from 'node:child_process'
import {
  makeEngine,
  recommendSession,
  type CreditNow,
  type ErrorCode,
  type FeedbackResult,
  type Outcome,
} from '@filmes/engine'
import { describe, expect, it, vi } from 'vite-plus/test'
import { useFixture } from '../../../packages/engine/test/fixture.ts'
import {
  feedbackAction,
  feedbackFromEngine,
  feedbackPage,
  openSessionList,
  type Feedback,
  type FeedbackSession,
} from './feedback'
import type { Owner } from './owners'

const BRUNO: Owner = {
  person: 'bruno',
  name: 'Bruno',
  email: 'bruno@example.org',
  admin: false,
}

const ORIGIN = 'http://localhost'

const failure = (code: ErrorCode): Outcome<never> => ({
  exitCode: 1,
  output: { error: { code, message: `mensagem de ${code}` } },
})

const SESSION: FeedbackSession = {
  id: '2026-11-20-quim',
  date: '2026-11-20',
  request: null,
  attendees: [
    { person: 'bruno', name: 'Bruno', owner: true },
    { person: 'quim', name: 'Quim', owner: false },
  ],
  recommendation: [{ position: 1, id: 'tt9000101', title: 'O Farol de Areia' }],
}

const RECORDED: FeedbackResult = {
  session: { id: SESSION.id, file: `sessions/${SESSION.id}.md` },
  chosen: null,
  facts: [],
  withoutReaction: [],
}

/** A Feedback that answers from fixed outcomes, and remembers what it was
 * asked to record. */
function fake(
  outcomes: {
    sessions?: Outcome<FeedbackSession[]>
    credit?: Outcome<readonly CreditNow[]>
    record?: Outcome<FeedbackResult>
  } = {},
) {
  const record = vi.fn<Feedback['record']>(
    async () => outcomes.record ?? { exitCode: 0, output: RECORDED },
  )
  const feedback: Feedback = {
    sessions: async () =>
      outcomes.sessions ?? { exitCode: 0, output: [SESSION] },
    credit: async (attendees) =>
      outcomes.credit ?? {
        exitCode: 0,
        output: attendees.map((person) => ({ person, value: 0, line: null })),
      },
    record,
  }
  return { feedback, record }
}

const post = (
  fields: Record<string, string>,
  origin: string | null = ORIGIN,
) => {
  const body = new FormData()
  for (const [name, value] of Object.entries(fields)) body.set(name, value)
  return new Request(`${ORIGIN}/feedback/${SESSION.id}/enviar`, {
    method: 'POST',
    body,
    headers: origin === null ? {} : { origin },
  })
}

const FORM = { filme: 'tt9000101', 'reacao.bruno': 'nota:4' }

describe('feedbackAction', () => {
  const act = (
    request: Request,
    feedback: Feedback,
    owner: Owner | null = BRUNO,
  ) => feedbackAction(request, SESSION.id, owner, feedback, ORIGIN)

  it('records the form as the logged-in Dono and goes back to the list', async () => {
    const { feedback, record } = fake()
    const response = await act(
      post({
        filme: 'outro',
        busca: 'Casa Cheia',
        'reacao.bruno': 'nota:4,5',
        'reacao.quim': 'relato:nao-gostou',
        'comentario.quim': 'dormiu',
      }),
      feedback,
    )
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe(
      '/feedback?feito=2026-11-20-quim',
    )
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect(record).toHaveBeenCalledWith(
      SESSION.id,
      {
        film: 'Casa Cheia',
        reactions: [
          {
            person: 'bruno',
            kind: 'rating',
            rating: '4,5',
            comment: undefined,
          },
          {
            person: 'quim',
            kind: 'report',
            level: 'não gostou',
            comment: 'dormiu',
          },
        ],
      },
      'bruno',
    )
  })

  it('sends who is not logged in to the login, and refuses another site', async () => {
    const { feedback, record } = fake()
    const login = await act(post(FORM), feedback, null)
    expect(login.headers.get('Location')).toBe('/entrar')
    expect(
      (await act(post(FORM, 'https://evil.example'), feedback)).status,
    ).toBe(403)
    expect((await act(post(FORM, null), feedback)).status).toBe(403)
    expect(record).not.toHaveBeenCalled()
  })

  it('goes back to the form with what the page refused', async () => {
    const { feedback, record } = fake()
    const response = await act(post({ 'comentario.quim': 'x' }), feedback)
    expect(response.headers.get('Location')).toBe(
      '/feedback/2026-11-20-quim?erro=comentario',
    )
    expect(record).not.toHaveBeenCalled()
  })

  it.each<[ErrorCode, string]>([
    ['closed_session', '/feedback/2026-11-20-quim?erro=fechada'],
    ['unknown_film', '/feedback/2026-11-20-quim?erro=desconhecido'],
    ['ambiguous_film', '/feedback/2026-11-20-quim?erro=ambiguo'],
    ['invalid_usage', '/feedback/2026-11-20-quim?erro=pedido'],
    ['unknown_person', '/feedback/2026-11-20-quim?erro=pedido'],
    ['unknown_session', '/feedback?erro=sessao'],
    ['missing_database', '/feedback/2026-11-20-quim?erro=indisponivel'],
  ])('says why the engine refused %s', async (code, location) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { feedback } = fake({ record: failure(code) })
    const response = await act(post(FORM), feedback)
    expect(response.headers.get('Location')).toBe(location)
    expect(log.mock.calls.length > 0).toBe(code === 'missing_database')
    log.mockRestore()
  })
})

describe('the pages', () => {
  it('shows the open Session with its Presentes’ Crédito', async () => {
    const line = 'na Sessão de 2026-11-19 (Casa Cheia), Quim deu 1'
    const { feedback } = fake({
      credit: {
        exitCode: 0,
        output: [
          { person: 'bruno', value: 0, line: null },
          { person: 'quim', value: 0.5, line },
        ],
      },
    })
    expect(await feedbackPage(SESSION.id, feedback)).toEqual({
      ...SESSION,
      credit: [
        { person: 'bruno', name: 'Bruno', value: 0, line: null },
        { person: 'quim', name: 'Quim', value: 0.5, line },
      ],
    })
    expect(await feedbackPage('2026-11-19', feedback)).toBe('unknown')
  })

  it('is unavailable when the engine cannot run, and logs why', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = fake({ sessions: failure('missing_database') }).feedback
    expect(await openSessionList(broken)).toBe(null)
    expect(await feedbackPage(SESSION.id, broken)).toBe(null)
    const noCredit = fake({ credit: failure('internal') }).feedback
    expect(await feedbackPage(SESSION.id, noCredit)).toBe(null)
    expect(log).toHaveBeenCalledWith(
      'engine: missing_database: mensagem de missing_database',
    )
    log.mockRestore()
  })
})

// --- the real engine -----------------------------------------------------------

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' })

describe('feedbackFromEngine', () => {
  it('closes a Session with one commit signed by the Dono, and the next one sees the Crédito', async () => {
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
    const engine = makeEngine(fixture.vars)
    const open = async () => {
      const outcome = await engine.run(
        recommendSession({ attendees: ['dono', 'quim'], count: 3 }),
        { owner: 'bruno' },
      )
      if (outcome.exitCode !== 0) throw new Error(JSON.stringify(outcome))
      return outcome.output
    }
    try {
      const feedback = feedbackFromEngine(engine)
      const first = await open()
      const list = await openSessionList(feedback)
      expect(list).toEqual([
        {
          id: first.session.id,
          date: '2026-11-20',
          request: null,
          attendees: [
            { person: 'bruno', name: 'Bruno', owner: true },
            { person: 'quim', name: 'Quim', owner: false },
          ],
          recommendation: first.films.map((f) => ({
            position: f.position,
            id: f.id,
            title: f.title,
          })),
        },
      ])

      // Bruno hated Pequenos Milagres; Quim loved it and said why.
      const response = await feedbackAction(
        post({
          filme: 'outro',
          busca: 'Pequenos Milagres',
          'reacao.bruno': 'nota:1',
          'reacao.quim': 'nota:5',
          'comentario.quim': 'chorei',
        }),
        first.session.id,
        BRUNO,
        feedback,
        ORIGIN,
      )
      expect(response.headers.get('Location')).toBe(
        `/feedback?feito=${first.session.id}`,
      )
      expect(await openSessionList(feedback)).toEqual([])
      const log = git(fixture.data, 'log', '-1', '--format=%an <%ae>|%s')
      expect(log.trim()).toBe(
        `Bruno <bruno@example.org>|feedback ${first.session.id}`,
      )

      const next = await open()
      const page = await feedbackPage(next.session.id, feedback)
      if (page === null || page === 'unknown') throw new Error(String(page))
      expect(page.credit).toEqual([
        {
          person: 'bruno',
          name: 'Bruno',
          value: 0.4444,
          line: 'na Sessão de 2026-11-20 (Pequenos Milagres), Bruno deu 1 e a média dos Presentes foi 3',
        },
        { person: 'quim', name: 'Quim', value: 0, line: null },
      ])
    } finally {
      await engine.dispose()
    }
  }, 60_000) // real git commits: slow on a loaded machine
})
