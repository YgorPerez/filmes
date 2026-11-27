import { execFileSync } from 'node:child_process'
import {
  makeEngine,
  REQUEST_READING_MAX_LENGTH,
  type ErrorCode,
  type Outcome,
} from '@filmes/engine'
import { describe, expect, it, vi } from 'vite-plus/test'
import {
  useFixture,
  type Fixture,
} from '../../../packages/engine/test/fixture.ts'
import {
  parseSessionRequest,
  type SessionRequestForm,
} from '#/content/session-request'
import {
  newSessionDraft,
  repeatDraft,
  requestOptions,
  sessionList,
  sessionPage,
  sessionRequestAction,
  sessionsFromEngine,
  type SessionItem,
  type Sessions,
} from './sessions'
import { Notes } from './notes'

const BRUNO = {
  person: 'bruno',
  name: 'Bruno',
  email: 'bruno@example.org',
  admin: false,
}

const ORIGIN = 'http://localhost'

const failure = (code: ErrorCode, message = `mensagem de ${code}`) =>
  ({ exitCode: 1, output: { error: { code, message } } }) as Outcome<never>

const SESSION: SessionItem = {
  id: '2026-11-20-iara',
  date: '2026-11-20',
  request: null,
  attendees: [
    { person: 'bruno', name: 'Bruno', owner: true },
    { person: 'iara', name: 'Iara', owner: false },
  ],
  recommendation: [{ position: 1, id: 'tt9000101', title: 'O Farol de Areia' }],
  open: true,
  chosen: null,
  moods: [],
  constraints: [],
}

/** Sessions that answer from fixed outcomes, and remember what they were
 * asked to open. */
function fake(
  outcomes: {
    list?: Outcome<SessionItem[]>
    open?: Outcome<{ id: string; warnings: string[] }>
  } = {},
) {
  const open = vi.fn<Sessions['open']>(
    async () =>
      outcomes.open ?? {
        exitCode: 0,
        output: { id: '2026-11-20-iara', warnings: [] },
      },
  )
  const sessions: Sessions = {
    list: async () => outcomes.list ?? { exitCode: 0, output: [SESSION] },
    options: async () => failure('missing_database'),
    open,
    read: async () => failure('missing_database'),
  }
  return { sessions, open }
}

const form = (fields: [string, string][]) => {
  const body = new FormData()
  for (const [name, value] of fields) body.append(name, value)
  return body
}

const post = (fields: [string, string][], origin: string | null = ORIGIN) =>
  new Request(`${ORIGIN}/sessoes/nova/enviar`, {
    method: 'POST',
    body: form(fields),
    headers: origin === null ? {} : { origin },
  })

const BASIC: [string, string][] = [
  ['presentes', 'bruno'],
  ['presentes', 'iara'],
]

describe('parseSessionRequest', () => {
  const parse = (fields: [string, string][]) =>
    parseSessionRequest(form([...BASIC, ...fields]))

  it('asks for no Série na ordem in its default mode, nor for a mode it does not offer', () => {
    expect(parse([['serie', 'anterior']])).toEqual(parse([]))
    expect(parse([['serie', 'sempre']])).toEqual(parse([]))
    expect(parse([['serie', 'tanto-faz']])).toMatchObject({
      ok: { seriesOrder: 'off' },
    })
  })

  it('reads every Restrição into the engine’s request', () => {
    expect(
      parse([
        ['regra', 'de'],
        ['de', 'iara'],
        ['climas', 'leve'],
        ['climas', 'pra rir'],
        ['quantos', '4'],
        ['pedido', ' eu e a Iara '],
        ['duracao', '110'],
        ['desde', '1990'],
        ['ate', '2010'],
        ['idioma', 'pt'],
        ['crianca', '0'],
        ['gatilhos', 'animal morre, , aranhas'],
        ['parecido', 'tt9000101, tt9000601'],
        ['sem-ja-visto', 'sim'],
        ['sem-lento', 'sim'],
        ['sem-tristeza', 'sim'],
        ['serie', 'todos'],
      ]),
    ).toEqual({
      ok: {
        attendees: ['bruno', 'iara'],
        rule: 'by',
        by: 'iara',
        moods: ['leve', 'pra rir'],
        count: 4,
        request: 'eu e a Iara',
        maxDuration: 110,
        since: 1990,
        until: 2010,
        language: 'pt',
        child: 0,
        triggers: ['animal morre', 'aranhas'],
        similar: ['tt9000101', 'tt9000601'],
        unseen: true,
        noSlow: true,
        noSad: true,
        seriesOrder: 'all',
      } satisfies SessionRequestForm,
    })
  })

  it('leaves out what was not asked', () => {
    expect(
      parse([
        ['regra', 'media'],
        ['de', ''],
      ]),
    ).toEqual({
      ok: { attendees: ['bruno', 'iara'], rule: 'average', moods: [] },
    })
  })

  it.each<[string, [string, string][]]>([
    ['presentes', []],
    ['de', [...BASIC, ['regra', 'de']]],
    ['de', [...BASIC, ['regra', 'de'], ['de', 'quim']]],
    ['quantos', [...BASIC, ['quantos', '0']]],
    ['quantos', [...BASIC, ['quantos', '2,5']]],
    ['duracao', [...BASIC, ['duracao', '-3']]],
    ['anos', [...BASIC, ['desde', '2010'], ['ate', '1990']]],
    ['anos', [...BASIC, ['desde', '90']]],
    ['crianca', [...BASIC, ['crianca', '18']]],
    ['parecido', [...BASIC, ['parecido', 'Casa Cheia']]],
  ])('refuses %s', (refused, fields) => {
    expect(parseSessionRequest(form(fields))).toEqual({ refused })
  })
})

describe('sessionRequestAction', () => {
  const act = (
    request: Request,
    sessions: Sessions,
    owner: typeof BRUNO | null = BRUNO,
    notes = new Notes(),
  ) => sessionRequestAction(request, owner, sessions, notes, ORIGIN)

  it('opens the Session as the logged-in Dono and goes to its page', async () => {
    const { sessions, open } = fake()
    const response = await act(post([...BASIC, ['sem-lento', 'sim']]), sessions)
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe(
      '/sessoes/2026-11-20-iara?feito=aberta',
    )
    expect(open).toHaveBeenCalledWith(
      {
        attendees: ['bruno', 'iara'],
        rule: 'default',
        moods: [],
        noSlow: true,
      },
      'bruno',
    )
  })

  it('keeps the Recomendação’s warnings for the page in a note', async () => {
    const warnings = ['sem chave do OMDb: a classificação vem só do banco']
    const { sessions } = fake({
      open: { exitCode: 0, output: { id: '2026-11-20-iara', warnings } },
    })
    const notes = new Notes()
    const location =
      (await act(post(BASIC), sessions, BRUNO, notes)).headers.get(
        'Location',
      ) ?? ''
    const token = /&nota=([\w-]+)$/.exec(location)?.[1]
    expect(location).toMatch(/^\/sessoes\/2026-11-20-iara\?feito=aberta&nota=/)
    expect(notes.recall(token)).toEqual({ warnings, addition: null })
  })

  it('sends who is not logged in to the login, and refuses another site', async () => {
    const { sessions, open } = fake()
    expect(
      (await act(post(BASIC), sessions, null)).headers.get('Location'),
    ).toBe('/entrar')
    expect(
      (await act(post(BASIC, 'https://evil.example'), sessions)).status,
    ).toBe(403)
    expect(open).not.toHaveBeenCalled()
  })

  it('goes back to the form with what the page refused', async () => {
    const { sessions, open } = fake()
    const response = await act(post([]), sessions)
    expect(response.headers.get('Location')).toBe(
      '/sessoes/nova?erro=presentes',
    )
    expect(open).not.toHaveBeenCalled()
  })

  it.each<[ErrorCode, string, string]>([
    ['invalid_usage', '--parecido tt1: filme fora do Catálogo', 'parecido'],
    ['invalid_usage', '--idioma vazio', 'pedido'],
    ['unknown_person', 'não há Pessoa', 'pessoa'],
    ['ambiguous_person', 'duas Pessoas', 'pessoa'],
    ['missing_database', 'sem banco', 'falha'],
    ['outdated_database', 'outro schema', 'falha'],
    ['internal', 'SqliteError: no such column: par_a_par', 'falha'],
    ['internal', 'SqliteError: database is locked', 'indisponivel'],
    ['source_unavailable', 'TMDB fora do ar', 'indisponivel'],
  ])('says why the engine refused %s (%s)', async (code, message, refusal) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { sessions } = fake({ open: failure(code, message) })
    const response = await act(post(BASIC), sessions)
    expect(response.headers.get('Location')).toBe(
      `/sessoes/nova?erro=${refusal}`,
    )
    expect(log.mock.calls.length > 0).toBe(
      refusal === 'indisponivel' || refusal === 'falha',
    )
    log.mockRestore()
  })
})

const ler = (fields: [string, string][], origin: string | null = ORIGIN) =>
  post([...fields, ['ler', 'sim']], origin)

/** "Ler" posted with `fields` as the Dono `owner`, with the real engine on
 * `fixture`: where it went and the draft its note holds. Opens nothing. */
async function readForm(
  fixture: Fixture,
  fields: [string, string][],
  owner = 'bruno',
) {
  const engine = makeEngine(fixture.vars)
  const open = vi.fn<Sessions['open']>()
  const notes = new Notes()
  try {
    const response = await sessionRequestAction(
      ler(fields),
      { ...BRUNO, person: owner },
      { ...sessionsFromEngine(engine), open },
      notes,
      ORIGIN,
    )
    expect(open).not.toHaveBeenCalled()
    const location = response.headers.get('Location') ?? ''
    const token = new URL(location, ORIGIN).searchParams.get('nota')
    return {
      location,
      draft: newSessionDraft(token ?? undefined, notes),
    }
  } finally {
    await engine.dispose()
  }
}

describe('“Ler” in sessionRequestAction', () => {
  it('goes back to the form with the sentence read on top of what the Dono set', async () => {
    const { location, draft } = await readForm(useFixture(), [
      ...BASIC,
      ['climas', 'tenso'],
      ['sem-tristeza', 'sim'],
      ['duracao', '90'],
      ['pedido', 'eu e o Quim, algo leve, até 2h, 3 filmes, com pipoca'],
    ])

    expect(location).toMatch(/^\/sessoes\/nova\?nota=[\w-]+$/)
    expect(draft).toEqual({
      fields: {
        attendees: ['bruno', 'iara', 'quim'],
        rule: 'default',
        moods: ['tenso', 'leve'],
        count: 3,
        request: 'eu e o Quim, algo leve, até 2h, 3 filmes, com pipoca',
        maxDuration: 120,
        noSad: true,
      },
      reading: {
        understood: [
          'Presente: Bruno',
          'Presente: Quim',
          'Clima: leve',
          'até 2h',
          '3 filmes',
        ],
        notUnderstood: ['pipoca'],
        ambiguities: [],
      },
    })
  })

  it('keeps the Parecido “Usar” took, and adds the one the sentence names', async () => {
    const { draft } = await readForm(useFixture(), [
      ...BASIC,
      ['parecido', 'tt9000101'],
      ['pedido', 'algo leve'],
    ])
    expect(draft?.fields).toMatchObject({
      moods: ['leve'],
      similar: ['tt9000101'],
    })

    const both = await readForm(useFixture(), [
      ...BASIC,
      ['parecido', 'tt9000101'],
      ['pedido', 'parecido com Poeira'],
    ])
    expect(both.draft?.fields.similar).toEqual(['tt9000101', 'tt9001904'])
  })

  it('keeps the films of an unclear title, with their ids, for “Usar”', async () => {
    const { draft } = await readForm(useFixture(), [
      ...BASIC,
      ['pedido', 'parecido com Reprise; tipo Amélie'],
    ])
    expect(draft?.reading?.ambiguities).toEqual([
      {
        field: 'similar',
        words: 'Reprise',
        candidates: [
          { id: 'tt9012601', label: 'Reprise (2011)' },
          { id: 'tt9012602', label: 'Reprise (2004)' },
        ],
      },
      { field: 'similar', words: 'Amélie', candidates: [] },
    ])
  })

  it('takes "eu" as the logged-in Dono and reads nothing of taste', async () => {
    const { draft } = await readForm(
      useFixture(),
      [['pedido', 'eu; a Iara odeia terror']],
      'vera',
    )
    expect(draft?.fields.attendees).toEqual(['vera'])
    expect(draft?.reading?.notUnderstood).toEqual(['Iara odeia terror'])
  })

  it('refuses an empty sentence and one longer than the engine reads', async () => {
    const empty = await readForm(useFixture(), [...BASIC, ['pedido', '  ']])
    expect(empty.location).toBe('/sessoes/nova?erro=frase')
    const long = await readForm(useFixture(), [
      ...BASIC,
      ['pedido', 'a'.repeat(REQUEST_READING_MAX_LENGTH + 1)],
    ])
    expect(long.location).toBe('/sessoes/nova?erro=frase-longa')
  })

  it('says so, and logs why, when the engine cannot read', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await sessionRequestAction(
      ler([...BASIC, ['pedido', 'leve']]),
      BRUNO,
      fake().sessions,
      new Notes(),
      ORIGIN,
    )
    expect(response.headers.get('Location')).toBe('/sessoes/nova?erro=falha')
    expect(log).toHaveBeenCalledWith(
      'engine: missing_database: mensagem de missing_database',
    )
    log.mockRestore()
  })

  it('sends who is not logged in to the login, and refuses another site', async () => {
    const act = (request: Request, owner: typeof BRUNO | null = BRUNO) =>
      sessionRequestAction(request, owner, fake().sessions, new Notes(), ORIGIN)
    expect(
      (await act(ler([['pedido', 'eu']]), null)).headers.get('Location'),
    ).toBe('/entrar')
    expect(
      (await act(ler([['pedido', 'eu']], 'https://evil.example'))).status,
    ).toBe(403)
  })
})

describe('the Catálogo search in sessionRequestAction', () => {
  const search = (fields: [string, string][], notes = new Notes()) =>
    sessionRequestAction(
      post([...fields, ['buscar-catalogo', 'sim']]),
      BRUNO,
      fake().sessions,
      notes,
      ORIGIN,
    )

  it('comes back with the search and the form as the Dono left it, opening nothing', async () => {
    const notes = new Notes()
    const { sessions, open } = fake()
    const response = await sessionRequestAction(
      post([
        ...BASIC,
        ['climas', 'leve'],
        ['pedido', 'eu e a Iara'],
        ['parecido', 'tt9000101'],
        ['buscar', ' farol '],
        ['buscar-catalogo', 'sim'],
      ]),
      BRUNO,
      sessions,
      notes,
      ORIGIN,
    )
    expect(open).not.toHaveBeenCalled()
    const location = new URL(response.headers.get('Location') ?? '', ORIGIN)
    expect(location.pathname).toBe('/sessoes/nova')
    expect(location.searchParams.get('buscar')).toBe('farol')
    const draft = newSessionDraft(
      location.searchParams.get('nota') ?? undefined,
      notes,
    )
    expect(draft).toEqual({
      fields: {
        attendees: ['bruno', 'iara'],
        rule: 'default',
        moods: ['leve'],
        request: 'eu e a Iara',
        similar: ['tt9000101'],
      },
      reading: null,
    })
  })

  it('keeps what “Ler” said about the sentence', async () => {
    const notes = new Notes()
    const reading = {
      understood: ['Presente: Iara'],
      notUnderstood: [],
      ambiguities: [],
    }
    const before = notes.remember({
      warnings: [],
      addition: null,
      form: { attendees: ['iara'] },
      reading,
    })
    const response = await search([...BASIC, ['nota', before ?? '']], notes)
    const token = new URL(
      response.headers.get('Location') ?? '',
      ORIGIN,
    ).searchParams.get('nota')
    expect(newSessionDraft(token ?? undefined, notes)?.reading).toEqual(reading)
  })

  it('Enter with a search not run yet searches instead of opening', async () => {
    const { sessions, open } = fake()
    const response = await sessionRequestAction(
      post([
        ...BASIC,
        ['buscar', 'farol'],
        ['buscado', ''],
        ['tecla', 'enter'],
      ]),
      BRUNO,
      sessions,
      new Notes(),
      ORIGIN,
    )
    const location = new URL(response.headers.get('Location') ?? '', ORIGIN)
    expect(location.pathname).toBe('/sessoes/nova')
    expect(location.searchParams.get('buscar')).toBe('farol')
    expect(open).not.toHaveBeenCalled()
  })

  it('Enter with the search already run opens the Session', async () => {
    const { sessions, open } = fake()
    await sessionRequestAction(
      post([
        ...BASIC,
        ['buscar', 'farol'],
        ['buscado', 'farol'],
        ['tecla', 'enter'],
      ]),
      BRUNO,
      sessions,
      new Notes(),
      ORIGIN,
    )
    expect(open).toHaveBeenCalled()
  })

  it('with nothing typed, comes back to the form with no search', async () => {
    const location = new URL(
      (await search(BASIC)).headers.get('Location') ?? '',
      ORIGIN,
    )
    expect(location.searchParams.has('buscar')).toBe(false)
  })
})

describe('newSessionDraft', () => {
  it('is null with no note, a forgotten one, or one of another form', () => {
    const notes = new Notes()
    const other = notes.remember({ warnings: ['aviso'], addition: null })
    expect(newSessionDraft(undefined, notes)).toBeNull()
    expect(newSessionDraft('nada', notes)).toBeNull()
    expect(newSessionDraft(other, notes)).toBeNull()
  })
})

describe('repeatDraft', () => {
  it('fills Nova Sessão as the Sessão was asked, leaving out what the form asks again', () => {
    expect(
      repeatDraft({
        attendees: ['bruno', 'iara'],
        session: '2026-11-20-1',
        moods: ['leve'],
        count: 5,
        request: null,
        maxDuration: 120,
        noSlow: true,
        similar: ['tt1'],
      }),
    ).toEqual({
      fields: {
        attendees: ['bruno', 'iara'],
        rule: 'default',
        moods: ['leve'],
        count: 5,
        maxDuration: 120,
        noSlow: true,
      },
      reading: null,
    })
  })
})

describe('the pages', () => {
  it('find the Session by its id, or say there is none', async () => {
    const { sessions } = fake()
    expect(await sessionPage(SESSION.id, sessions)).toEqual(SESSION)
    expect(await sessionPage('2026-11-19', sessions)).toBe('unknown')
  })

  it('are null, and log why, when the engine cannot run', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { sessions } = fake({ list: failure('missing_database') })
    expect(await sessionList(sessions)).toBeNull()
    expect(await sessionPage(SESSION.id, sessions)).toBeNull()
    expect(await requestOptions(sessions)).toBeNull()
    expect(log).toHaveBeenCalledWith(
      'engine: missing_database: mensagem de missing_database',
    )
    log.mockRestore()
  })
})

const commitAll = (cwd: string) =>
  execFileSync(
    'sh',
    [
      '-c',
      'git init -q -b master && git add -A && ' +
        'git -c user.name=fixture -c user.email=fixture@example.org commit -qm initial',
    ],
    { cwd },
  )

describe('sessionsFromEngine', () => {
  it('opens a Session with the form’s Restrições, signed by the Dono, and lists it', async () => {
    const fixture = useFixture()
    commitAll(fixture.data)
    const engine = makeEngine(fixture.vars)
    try {
      const sessions = sessionsFromEngine(engine)
      const options = await requestOptions(sessions)
      expect(options?.people[0]).toEqual({
        person: 'bruno',
        name: 'Bruno',
        owner: true,
      })
      expect(options?.people.map((p) => p.person).toSorted()).toEqual([
        'bruno',
        'iara',
        'quim',
        'rosa',
        'teo',
        'vera',
      ])
      expect(options?.moods).toContain('leve')
      expect(await sessionList(sessions)).toEqual([])

      const parsed = parseSessionRequest(
        form([
          ['presentes', 'bruno'],
          ['presentes', 'iara'],
          ['quantos', '2'],
          ['duracao', '130'],
          ['climas', 'leve'],
          ['pedido', 'eu e a Iara'],
        ]),
      )
      if (!('ok' in parsed)) throw new Error(parsed.refused)
      const opened = await sessions.open(parsed.ok, 'bruno')
      expect(opened).toEqual({
        exitCode: 0,
        output: { id: '2026-11-20-iara', warnings: expect.any(Array) },
      })
      const log = execFileSync('git', ['log', '-1', '--format=%an <%ae>|%s'], {
        cwd: fixture.data,
        encoding: 'utf8',
      })
      expect(log.trim()).toBe(
        'Bruno <bruno@example.org>|open session 2026-11-20 (bruno, iara)',
      )

      const page = await sessionPage('2026-11-20-iara', sessions)
      expect(page).toMatchObject({
        id: '2026-11-20-iara',
        request: 'eu e a Iara',
        attendees: [
          { person: 'bruno', name: 'Bruno', owner: true },
          { person: 'iara', name: 'Iara', owner: false },
        ],
        open: true,
        chosen: null,
        moods: ['leve'],
        constraints: ['até 2h10'],
      })
      expect(page !== 'unknown' && page?.recommendation).toHaveLength(2)
    } finally {
      await engine.dispose()
    }
  }, 60_000) // a real git commit: slow on a loaded machine
})
