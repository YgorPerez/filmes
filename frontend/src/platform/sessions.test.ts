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
  SENTENCE_MAX_LENGTH,
  sentenceParam,
  type SessionRequestForm,
} from '#/content/session-request'
import {
  readerFromEngine,
  requestOptions,
  sentenceReading,
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

describe('sentenceParam', () => {
  it('keeps in `?frase=` only a sentence the engine reads', () => {
    expect(sentenceParam('  eu e a Iara ')).toBe('eu e a Iara')
    expect(sentenceParam('  ')).toBeUndefined()
    expect(sentenceParam(3)).toBeUndefined()
    expect(sentenceParam('a'.repeat(SENTENCE_MAX_LENGTH + 1))).toBeUndefined()
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
    ['missing_database', 'sem banco', 'indisponivel'],
  ])('says why the engine refused %s (%s)', async (code, message, refusal) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { sessions } = fake({ open: failure(code, message) })
    const response = await act(post(BASIC), sessions)
    expect(response.headers.get('Location')).toBe(
      `/sessoes/nova?erro=${refusal}`,
    )
    expect(log.mock.calls.length > 0).toBe(refusal === 'indisponivel')
    log.mockRestore()
  })
})

describe('“Ler” in sessionRequestAction', () => {
  const act = (request: Request, owner: typeof BRUNO | null = BRUNO) =>
    sessionRequestAction(request, owner, fake().sessions, new Notes(), ORIGIN)
  const read = (sentence: string | null, origin: string | null = ORIGIN) =>
    post(
      [
        ...BASIC,
        ['ler', 'sim'],
        ...(sentence === null
          ? []
          : ([['pedido', sentence]] as [string, string][])),
      ],
      origin,
    )

  it('opens nothing and takes the sentence back to the form, which reads it', async () => {
    const { sessions, open } = fake()
    const response = await sessionRequestAction(
      read('  eu e a Iara, algo leve  '),
      BRUNO,
      sessions,
      new Notes(),
      ORIGIN,
    )
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe(
      '/sessoes/nova?frase=eu+e+a+Iara%2C+algo+leve',
    )
    expect(open).not.toHaveBeenCalled()
  })

  it('refuses an empty sentence and one longer than the engine reads', async () => {
    expect(SENTENCE_MAX_LENGTH).toBe(REQUEST_READING_MAX_LENGTH)
    expect((await act(read('  '))).headers.get('Location')).toBe(
      '/sessoes/nova?erro=frase',
    )
    expect((await act(read(null))).headers.get('Location')).toBe(
      '/sessoes/nova?erro=frase',
    )
    expect(
      (await act(read('a'.repeat(SENTENCE_MAX_LENGTH + 1)))).headers.get(
        'Location',
      ),
    ).toBe('/sessoes/nova?erro=frase-longa')
  })

  it('sends who is not logged in to the login, and refuses another site', async () => {
    expect((await act(read('eu'), null)).headers.get('Location')).toBe(
      '/entrar',
    )
    expect((await act(read('eu', 'https://evil.example'))).status).toBe(403)
  })
})

/** Reads `text` as the Dono `owner` with the real engine on `fixture`. */
async function read(fixture: Fixture, text: string, owner = 'bruno') {
  const engine = makeEngine(fixture.vars)
  try {
    return await sentenceReading(text, owner, readerFromEngine(engine))
  } finally {
    await engine.dispose()
  }
}

describe('sentenceReading', () => {
  it('fills the form with what it understood and lists what it did not', async () => {
    expect(
      await read(
        useFixture(),
        'eu e a Iara, algo leve, até 2h, tem criança de 7, 3 filmes, com pipoca',
      ),
    ).toEqual({
      text: 'eu e a Iara, algo leve, até 2h, tem criança de 7, 3 filmes, com pipoca',
      request: {
        attendees: ['bruno', 'iara'],
        moods: ['leve'],
        maxDuration: 120,
        child: 7,
        count: 3,
      },
      understood: [
        'Presente: Bruno',
        'Presente: Iara',
        'Clima: leve',
        'até 2h',
        'com criança de 7 anos',
        '3 filmes',
      ],
      notUnderstood: ['pipoca'],
      ambiguities: [],
    })
  })

  it('reads the Regra, the years, the language and the Restrições the form has', async () => {
    const reading = await read(
      useFixture(),
      'pelo gosto da Iara, dos anos 90, filme nacional, nada lento, nada triste, que ninguém viu',
    )
    expect(reading?.request).toEqual({
      attendees: ['iara'],
      rule: 'by',
      by: 'iara',
      since: 1990,
      until: 1999,
      language: 'pt',
      noSlow: true,
      noSad: true,
      unseen: true,
    })
    expect(reading?.notUnderstood).toEqual([])
  })

  it('takes "eu" as the logged-in Dono', async () => {
    expect((await read(useFixture(), 'eu e a Iara', 'vera'))?.request).toEqual({
      attendees: ['vera', 'iara'],
    })
  })
})

describe('sentenceReading, with what it cannot fill', () => {
  it('names the candidates of a title it cannot pin down, and a title with none', async () => {
    const reading = await read(
      useFixture(),
      'parecido com Reprise; tipo Amélie',
    )
    expect(reading?.request).toEqual({})
    expect(reading?.ambiguities).toEqual([
      { words: 'Reprise', candidates: ['Reprise (2011)', 'Reprise (2004)'] },
      { words: 'Amélie', candidates: [] },
    ])
  })

  it('takes a title it pins down as Parecido', async () => {
    expect((await read(useFixture(), 'entre Poeira e Coxia'))?.request).toEqual(
      {
        similar: ['tt9001904', 'tt9005504'],
      },
    )
  })

  it('reads nothing of taste', async () => {
    expect(await read(useFixture(), 'a Iara odeia terror')).toMatchObject({
      request: {},
      understood: [],
      notUnderstood: ['Iara odeia terror'],
    })
  })

  it('is null, and logs why, when the engine cannot run', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failed = {
      exitCode: 1,
      output: { error: { code: 'missing_database', message: 'sem banco' } },
    } as Outcome<never>
    expect(await sentenceReading('eu', 'bruno', async () => failed)).toBeNull()
    expect(log).toHaveBeenCalledWith('engine: missing_database: sem banco')
    log.mockRestore()
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
