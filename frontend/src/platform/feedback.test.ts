import { execFileSync } from 'node:child_process'
import {
  makeEngine,
  recommendSession,
  type SatisfactionNow,
  type ErrorCode,
  type FeedbackResult,
  type Outcome,
} from '@filmes/engine'
import { describe, expect, it, vi } from 'vite-plus/test'
import { useFixture } from '../../../packages/engine/test/fixture.ts'
import {
  feedbackAction,
  feedbackDraft,
  feedbackFromEngine,
  feedbackPage,
  openSessionList,
  type Feedback,
  type FeedbackSession,
} from './feedback'
import { Notes } from './notes'
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
  moods: [],
  constraints: [],
  additions: [],
  stars: {},
  earlier: [],
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
    satisfaction?: Outcome<SatisfactionNow>
    record?: Outcome<FeedbackResult>
  } = {},
) {
  const record = vi.fn<Feedback['record']>(
    async () => outcomes.record ?? { exitCode: 0, output: RECORDED },
  )
  const feedback: Feedback = {
    sessions: async () =>
      outcomes.sessions ?? { exitCode: 0, output: [SESSION] },
    satisfaction: async (attendees) =>
      outcomes.satisfaction ?? {
        exitCode: 0,
        output: {
          people: attendees.map((person) => ({
            person,
            satisfaction: null,
            line: null,
          })),
          disagreement: null,
        },
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

const FORM = { filme: 'tt9000101', 'reacao.bruno': 'nota:8' }

/** `feedbackAction` on the Session, as `owner` (Bruno by default). */
const act = (
  request: Request,
  feedback: Feedback,
  owner: Owner | null = BRUNO,
) => feedbackAction(request, SESSION.id, owner, feedback, new Notes(), ORIGIN)

describe('feedbackAction', () => {
  it('carries a Trakt warning to the closed Session', async () => {
    const warnings = ['Não foi possível concluir o envio ao Trakt.']
    const notes = new Notes()
    const { feedback } = fake({
      record: { exitCode: 0, output: { ...RECORDED, warnings } },
    })
    const response = await feedbackAction(
      post(FORM),
      SESSION.id,
      BRUNO,
      feedback,
      notes,
      ORIGIN,
    )
    const location = new URL(response.headers.get('Location')!, ORIGIN)
    expect(location.searchParams.get('feito')).toBe('contada')
    expect(
      notes.recall(location.searchParams.get('nota') ?? undefined)?.warnings,
    ).toEqual(warnings)
  })
})

describe('feedbackAction recording', () => {
  it('records the form as the logged-in Dono and goes back to the Session', async () => {
    const { feedback, record } = fake()
    const response = await act(
      post({
        filme: 'outro',
        busca: 'Casa Cheia',
        'reacao.bruno': 'nota:9',
        'reacao.quim': 'relato:nao-gostou',
        'comentario.quim': 'dormiu',
      }),
      feedback,
    )
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe(
      '/sessoes/2026-11-20-quim?feito=contada',
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
})

describe('feedbackAction refusing', () => {
  it('goes back to the form with what the page refused', async () => {
    const { feedback, record } = fake()
    const response = await act(post({ 'comentario.quim': 'x' }), feedback)
    expect(response.headers.get('Location')).toBe(
      '/sessoes/2026-11-20-quim/contar?erro=comentario',
    )
    expect(record).not.toHaveBeenCalled()
  })

  it.each<[ErrorCode, string]>([
    ['closed_session', '/sessoes/2026-11-20-quim/contar?erro=fechada'],
    ['unknown_film', '/sessoes/2026-11-20-quim/contar?erro=desconhecido'],
    ['ambiguous_film', '/sessoes/2026-11-20-quim/contar?erro=ambiguo'],
    ['invalid_usage', '/sessoes/2026-11-20-quim/contar?erro=pedido'],
    ['unknown_person', '/sessoes/2026-11-20-quim/contar?erro=pedido'],
    ['unknown_session', '/sessoes/2026-11-20-quim'],
    ['missing_database', '/sessoes/2026-11-20-quim/contar?erro=falha'],
  ])('says why the engine refused %s', async (code, location) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { feedback } = fake({ record: failure(code) })
    const response = await act(post(FORM), feedback)
    expect(response.headers.get('Location')).toBe(location)
    expect(log.mock.calls.length > 0).toBe(code === 'missing_database')
    log.mockRestore()
  })
})

/** The feedback form posted with `fields`, as Bruno, on a fake. */
const search = (fields: Record<string, string>, notes = new Notes()) => {
  const { feedback, record } = fake()
  const response = feedbackAction(
    post(fields),
    SESSION.id,
    BRUNO,
    feedback,
    notes,
    ORIGIN,
  )
  return { response, record }
}
const searched = (location: string | null) => new URL(location ?? '', ORIGIN)

describe('the Catálogo search in feedbackAction', () => {
  it('comes back to the form with the search, recording nothing', async () => {
    const asked = (busca: string) =>
      search({ filme: 'outro', busca, 'buscar-catalogo': 'sim' })
    const found = asked(' Fronteira (2012) ')
    expect((await found.response).headers.get('Location')).toBe(
      '/sessoes/2026-11-20-quim/contar?buscar=Fronteira+%282012%29',
    )
    const empty = asked('  ')
    expect((await empty.response).headers.get('Location')).toBe(
      '/sessoes/2026-11-20-quim/contar?erro=filme',
    )
    expect(found.record).not.toHaveBeenCalled()
  })

  it('keeps the reactions and comments the Dono had filled', async () => {
    const notes = new Notes()
    const { response, record } = search(
      {
        filme: 'outro',
        busca: 'fronteira',
        'reacao.bruno': 'nota:9',
        'reacao.quim': 'relato:gostou',
        'comentario.quim': 'quero ver de novo',
        'buscar-catalogo': 'sim',
      },
      notes,
    )
    const location = searched((await response).headers.get('Location'))
    expect(location.pathname).toBe('/sessoes/2026-11-20-quim/contar')
    expect(location.searchParams.get('buscar')).toBe('fronteira')
    expect(
      feedbackDraft(location.searchParams.get('nota') ?? undefined, notes),
    ).toEqual({
      bruno: { reaction: 'nota:9' },
      quim: { reaction: 'relato:gostou', comment: 'quero ver de novo' },
    })
    expect(record).not.toHaveBeenCalled()
  })
})

describe('the Catálogo search in feedbackAction, with Enter', () => {
  it('Enter with a title not searched yet searches instead of recording', async () => {
    const { response, record } = search({
      filme: 'outro',
      busca: 'fronteira',
      buscado: '',
      tecla: 'enter',
      'reacao.bruno': 'nota:8',
    })
    const location = searched((await response).headers.get('Location'))
    expect(location.searchParams.get('buscar')).toBe('fronteira')
    expect(record).not.toHaveBeenCalled()
  })

  it('Enter with the title already searched, or a click on the button, records', async () => {
    const enter = search({
      filme: 'outro',
      busca: 'Café Amargo',
      buscado: 'Café Amargo',
      tecla: 'enter',
      'reacao.bruno': 'nota:8',
    })
    expect((await enter.response).headers.get('Location')).toBe(
      '/sessoes/2026-11-20-quim?feito=contada',
    )
    const click = search({
      filme: 'outro',
      busca: 'Café Amargo',
      buscado: '',
      'reacao.bruno': 'nota:8',
    })
    expect((await click.response).headers.get('Location')).toBe(
      '/sessoes/2026-11-20-quim?feito=contada',
    )
  })
})

describe('feedbackDraft', () => {
  it('is null with no note, a forgotten one, or one of another form', () => {
    const notes = new Notes()
    const other = notes.remember({ warnings: ['aviso'], addition: null })
    expect(feedbackDraft(undefined, notes)).toBeNull()
    expect(feedbackDraft('nenhuma', notes)).toBeNull()
    expect(feedbackDraft(other, notes)).toBeNull()
  })
})

describe('the pages', () => {
  it('shows the open Session with its Presentes’ satisfaction', async () => {
    const line =
      'Quim: 0% nas últimas Sessões (deu 1 de 10 a Casa Cheia); você, 100%'
    const { feedback } = fake({
      satisfaction: {
        exitCode: 0,
        output: {
          people: [
            { person: 'bruno', satisfaction: 1, line: null },
            { person: 'quim', satisfaction: 0, line },
          ],
          disagreement: 1,
        },
      },
    })
    expect(await feedbackPage(SESSION.id, feedback)).toEqual({
      ...SESSION,
      satisfaction: [
        { person: 'bruno', name: 'Bruno', satisfaction: 1, line: null },
        { person: 'quim', name: 'Quim', satisfaction: 0, line },
      ],
    })
    expect(await feedbackPage('2026-11-19', feedback)).toBe('unknown')
  })

  it('is unavailable when the engine cannot run, and logs why', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const broken = fake({ sessions: failure('missing_database') }).feedback
    expect(await openSessionList(broken)).toBe(null)
    expect(await feedbackPage(SESSION.id, broken)).toBe(null)
    const noSatisfaction = fake({ satisfaction: failure('internal') }).feedback
    expect(await feedbackPage(SESSION.id, noSatisfaction)).toBe(null)
    expect(log).toHaveBeenCalledWith(
      'engine: missing_database: mensagem de missing_database',
    )
    log.mockRestore()
  })
})

// --- the real engine -----------------------------------------------------------

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' })

/** Puts the fixture's filmes-dados under git, in one commit. */
const commitAll = (cwd: string) => {
  git(cwd, 'init', '--quiet', '-b', 'master')
  git(cwd, 'add', '--all')
  git(
    cwd,
    '-c',
    'user.name=fixture',
    '-c',
    'user.email=fixture@example.org',
    'commit',
    '--quiet',
    '-m',
    'initial',
  )
}

/** Opens a Session for the Dono and Quim, as Bruno. */
const openWithQuim = async (engine: ReturnType<typeof makeEngine>) => {
  const outcome = await engine.run(
    recommendSession({ attendees: ['dono', 'quim'], count: 3 }),
    { owner: 'bruno' },
  )
  if (outcome.exitCode !== 0) throw new Error(JSON.stringify(outcome))
  return outcome.output
}

/** The open Sessions are only `first`, with its films in order. */
const expectOnlyOpen = async (
  feedback: Feedback,
  first: Awaited<ReturnType<typeof openWithQuim>>,
) => {
  const list = await openSessionList(feedback)
  expect(list).toEqual([
    {
      id: first.session.id,
      date: '2026-11-20',
      request: null,
      moods: [],
      constraints: [],
      additions: [],
      stars: {},
      earlier: [],
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
}

describe('feedbackFromEngine', () => {
  it('closes a Session with one commit signed by the Dono, and the next one sees the satisfaction', async () => {
    const fixture = useFixture()
    commitAll(fixture.data)
    const engine = makeEngine(fixture.vars)
    const open = () => openWithQuim(engine)
    try {
      const feedback = feedbackFromEngine(engine)
      const first = await open()
      await expectOnlyOpen(feedback, first)

      // Bruno hated Pequenos Milagres; Quim loved it and said why.
      const response = await feedbackAction(
        post({
          filme: 'outro',
          busca: 'Pequenos Milagres',
          'reacao.bruno': 'nota:2',
          'reacao.quim': 'nota:10',
          'comentario.quim': 'chorei',
        }),
        first.session.id,
        BRUNO,
        feedback,
        new Notes(),
        ORIGIN,
      )
      expect(response.headers.get('Location')).toBe(
        `/sessoes/${first.session.id}?feito=contada`,
      )
      expect(await openSessionList(feedback)).toEqual([])
      const log = git(fixture.data, 'log', '-1', '--format=%an <%ae>|%s')
      expect(log.trim()).toBe(
        `Bruno <bruno@example.org>|feedback ${first.session.id}`,
      )

      const next = await open()
      const page = await feedbackPage(next.session.id, feedback)
      if (page === null || page === 'unknown') throw new Error(String(page))
      expect(page.satisfaction).toEqual([
        {
          person: 'bruno',
          name: 'Bruno',
          satisfaction: 0.1111,
          line: 'Você: 11% nas últimas Sessões (deu 2 de 10 a Pequenos Milagres); Quim, 100%',
        },
        { person: 'quim', name: 'Quim', satisfaction: 1, line: null },
      ])
    } finally {
      await engine.dispose()
    }
  }, 60_000) // real git commits: slow on a loaded machine
})
