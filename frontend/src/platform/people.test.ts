import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeEngine, type ErrorCode, type Outcome } from '@filmes/engine'
import { describe, expect, it, vi } from 'vite-plus/test'
import { useFixture } from '../../../packages/engine/test/fixture.ts'
import { parseAction, type PersonAction } from '#/content/person-action'
import type { Owner } from './owners'
import {
  ownerAuthor,
  peopleFromEngine,
  peopleList,
  personAction,
  personPage,
  type People,
} from './people'

const BRUNO: Owner = {
  person: 'bruno',
  name: 'Bruno',
  email: 'bruno@example.org',
  admin: false,
}

const VERA: Owner = {
  person: 'vera',
  name: 'Vera',
  email: 'vera@example.org',
  admin: false,
}

const ORIGIN = 'http://localhost'

const failure = (code: ErrorCode): Outcome<never> => ({
  exitCode: 1,
  output: { error: { code, message: `mensagem de ${code}` } },
})

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [name, value] of Object.entries(fields)) data.set(name, value)
  return data
}

describe('parseAction', () => {
  it.each<[Record<string, string>, PersonAction]>([
    [
      { acao: 'declarar', texto: ' adora suspense ' },
      {
        kind: 'state',
        text: 'adora suspense',
        target: undefined,
        reaction: undefined,
        source: undefined,
      },
    ],
    [
      {
        acao: 'relatar',
        texto: 'odeia',
        alvo: 'Q9001801',
        reacao: 'hate',
        fonte: 'jantar',
      },
      {
        kind: 'report',
        text: 'odeia',
        target: 'Q9001801',
        reaction: 'hate',
        source: 'jantar',
      },
    ],
    [
      { acao: 'visto', filme: 'tt9000602', nota: '4,5', fonte: '' },
      { kind: 'seen', film: 'tt9000602', rating: '4,5', source: undefined },
    ],
    [
      { acao: 'visto', filme: 'tt9000602', nota: '' },
      { kind: 'seen', film: 'tt9000602', rating: undefined, source: undefined },
    ],
    [
      { acao: 'vetar', texto: 'nunca terror', alvo: 'Q9001801', grupo: '' },
      { kind: 'veto', text: 'nunca terror', target: 'Q9001801', group: false },
    ],
    [
      { acao: 'vetar', texto: 'nada bobo', alvo: '', grupo: 'silly_comedy' },
      { kind: 'veto', text: 'nada bobo', target: 'silly_comedy', group: true },
    ],
    [
      { acao: 'ajustar', elo: 'cast', nivel: 'none' },
      { kind: 'adjust', link: 'cast', level: 'none' },
    ],
    [
      { acao: 'pular', texto: 'curte terror?', assunto: 'Q9001801' },
      { kind: 'skip', text: 'curte terror?', subject: 'Q9001801' },
    ],
    [
      { acao: 'pular', texto: 'curte terror?' },
      { kind: 'skip', text: 'curte terror?', subject: undefined },
    ],
    [
      {
        acao: 'responder',
        pergunta: 'perguntas_abertas:1',
        texto: 'sim',
        reacao: 'like',
      },
      {
        kind: 'answer',
        question: 'perguntas_abertas:1',
        text: 'sim',
        reaction: 'like',
      },
    ],
    [
      { acao: 'remover', tipo: 'veto', id: 'vetos:abc' },
      { kind: 'remove', what: 'veto', id: 'vetos:abc' },
    ],
  ])('reads the form %j', (fields, action) => {
    expect(parseAction(form(fields))).toEqual(action)
  })

  it.each<Record<string, string>>([
    {},
    { acao: 'apagar-tudo' },
    { acao: 'declarar', texto: '   ' },
    { acao: 'declarar', texto: 'x', alvo: 'terror' },
    { acao: 'declarar', texto: 'x', reacao: 'love' },
    { acao: 'visto', filme: 'Q9001801' },
    { acao: 'visto', filme: 'tt1', nota: '7' },
    { acao: 'vetar', texto: 'x', alvo: '' },
    { acao: 'vetar', texto: '', alvo: 'Q1' },
    { acao: 'ajustar', elo: 'cast', nivel: 'muito' },
    { acao: 'pular' },
    { acao: 'responder', texto: 'sim' },
    { acao: 'remover', tipo: 'open_question', id: 'x' },
  ])('refuses the form %j', (fields) => {
    expect(parseAction(form(fields))).toBeNull()
  })
})

/** A `People` whose every action answers `outcome`. */
function fakePeople(
  outcome: Outcome<'gravado'> = { exitCode: 0, output: 'gravado' },
) {
  const acted: { person: string; action: PersonAction; owner: Owner }[] = []
  const people: People = {
    list: async () => ({
      exitCode: 0,
      output: [{ person: 'bruno', name: 'Bruno', aliases: [], owner: true }],
    }),
    view: async () => failure('unknown_person'),
    tagGroups: async () => ({ exitCode: 0, output: [] }),
    act: async (person, action, owner) => {
      acted.push({ person, action, owner })
      return outcome
    },
  }
  return { people, acted }
}

const post = (fields: Record<string, string>, origin: string | null = ORIGIN) =>
  new Request(`${ORIGIN}/pessoas/iara/acao`, {
    method: 'POST',
    headers: origin ? { Origin: origin } : {},
    body: form(fields),
  })

const VETO = { acao: 'vetar', texto: 'nunca terror', alvo: 'Q9001801' }

describe('personAction', () => {
  it('runs the action as the logged-in Dono and goes back saying so', async () => {
    const { people, acted } = fakePeople()
    const response = await personAction(
      post(VETO),
      'iara',
      BRUNO,
      people,
      ORIGIN,
    )
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/pessoas/iara?feito=gravado')
    expect(acted).toEqual([
      {
        person: 'iara',
        action: {
          kind: 'veto',
          text: 'nunca terror',
          target: 'Q9001801',
          group: false,
        },
        owner: BRUNO,
      },
    ])
  })

  it('sends whoever is not a Dono to the login, without acting', async () => {
    const { people, acted } = fakePeople()
    const response = await personAction(
      post(VETO),
      'iara',
      null,
      people,
      ORIGIN,
    )
    expect(response.headers.get('Location')).toBe('/entrar')
    expect(acted).toEqual([])
  })

  it.each([null, 'https://elsewhere.example'])(
    'refuses a form from another origin (%s)',
    async (origin) => {
      const { people, acted } = fakePeople()
      const response = await personAction(
        post(VETO, origin),
        'iara',
        BRUNO,
        people,
        ORIGIN,
      )
      expect(response.status).toBe(403)
      expect(acted).toEqual([])
    },
  )

  it('goes back with the reason when the form is incomplete', async () => {
    const { people, acted } = fakePeople()
    const response = await personAction(
      post({ acao: 'vetar', texto: 'x' }),
      'iara',
      BRUNO,
      people,
      ORIGIN,
    )
    expect(response.headers.get('Location')).toBe('/pessoas/iara?erro=pedido')
    expect(acted).toEqual([])
  })

  it.each<[ErrorCode, string]>([
    ['unknown_target', '/pessoas/iara?erro=alvo'],
    ['invalid_usage', '/pessoas/iara?erro=pedido'],
    ['unknown_veto', '/pessoas/iara?erro=item'],
    ['ambiguous_stated', '/pessoas/iara?erro=item'],
    ['unknown_person', '/pessoas?erro=pessoa'],
    ['missing_database', '/pessoas/iara?erro=indisponivel'],
  ])('says why the engine refused: %s', async (code, location) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { people } = fakePeople(failure(code))
    const response = await personAction(
      post(VETO),
      'iara',
      BRUNO,
      people,
      ORIGIN,
    )
    expect(response.headers.get('Location')).toBe(location)
    // Only what the Dono cannot fix goes to the server log.
    expect(log.mock.calls).toEqual(
      code === 'missing_database'
        ? [['engine: missing_database: mensagem de missing_database']]
        : [],
    )
    log.mockRestore()
  })
})

describe('the pages', () => {
  it('lists the Pessoas, or null when the engine cannot run', async () => {
    const { people } = fakePeople()
    expect(await peopleList(people)).toEqual([
      { person: 'bruno', name: 'Bruno', aliases: [], owner: true },
    ])
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(
      await peopleList({
        ...people,
        list: async () => failure('missing_config'),
      }),
    ).toBeNull()
    expect(
      await personPage(
        'bruno',
        { ...people, view: async () => failure('missing_config') },
        BRUNO,
      ),
    ).toBeNull()
    log.mockRestore()
    expect(await personPage('ninguem', people, BRUNO)).toBe('unknown')
  })

  it('takes the author from the Dono', () => {
    expect(ownerAuthor(BRUNO)).toEqual({
      name: 'Bruno',
      email: 'bruno@example.org',
    })
  })
})

// --- the real engine -----------------------------------------------------------

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' })

describe('peopleFromEngine', () => {
  it('lists the fixture Pessoas and shows one with her Notas', async () => {
    const fixture = useFixture()
    const engine = makeEngine(fixture.vars)
    try {
      const people = peopleFromEngine(engine)
      const list = await peopleList(people)
      expect(list?.map((p) => p.person)).toEqual([
        'bruno',
        'iara',
        'quim',
        'rosa',
        'teo',
        'vera',
      ])
      expect(list?.[0]).toEqual({
        person: 'bruno',
        name: 'Bruno',
        aliases: ['eu'],
        owner: true,
      })
      const page = await personPage('quim', people, BRUNO)
      if (page === null || page === 'unknown') throw new Error(String(page))
      expect(page.openQuestions.map((q) => q.label)).toEqual(['Helena Prado'])
      expect(page.ratings?.length).toBe(4)
      expect(page.tagGroups.map((g) => g.key)).toEqual(['silly_comedy', 'slow'])
      expect(page).not.toHaveProperty('imports')
      expect(page.viewer).toEqual({ person: 'bruno', name: 'Bruno' })
    } finally {
      await engine.dispose()
    }
  })

  it('takes a Relato about another Dono, never about the logged-in one', async () => {
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
    try {
      const people = peopleFromEngine(engine)
      const report = { kind: 'report', text: 'adora suspense' } as const
      expect(await people.act('vera', report, BRUNO)).toEqual({
        exitCode: 0,
        output: 'gravado',
      })
      const own = await people.act('bruno', report, BRUNO)
      expect(own.exitCode === 0 ? null : own.output.error.code).toBe(
        'invalid_usage',
      )
      // Vera sees on her page what Bruno told of her taste.
      const page = await personPage('vera', people, VERA)
      if (page === null || page === 'unknown') throw new Error(String(page))
      expect(page.reports.map((r) => [r.text, r.source])).toEqual([
        ['adora suspense', 'descrição de Bruno'],
      ])
    } finally {
      await engine.dispose()
    }
    const log = git(fixture.data, 'log', '--format=%an <%ae>|%s').trim()
    expect(log.split('\n')[0]).toMatch(/^Bruno <bruno@example\.org>\|pessoa /)
    expect(log.split('\n')).toHaveLength(2)
  }, 30_000)

  it('writes each action to her file, one commit signed by the Dono', async () => {
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
    const file = () =>
      readFileSync(join(fixture.data, 'people/iara.md'), 'utf8')
    try {
      const people = peopleFromEngine(engine)
      const act = async (action: PersonAction) => {
        const outcome = await people.act('iara', action, BRUNO)
        if (outcome.exitCode !== 0)
          throw new Error(JSON.stringify(outcome.output))
        return outcome.output
      }
      expect(
        await act({
          kind: 'veto',
          text: 'nunca terror',
          target: 'Q9001801',
          group: false,
        }),
      ).toBe('gravado')
      expect(
        await act({
          kind: 'veto',
          text: 'nunca terror',
          target: 'Q9001801',
          group: false,
        }),
      ).toBe('igual')
      expect(
        await act({
          kind: 'veto',
          text: 'nada bobo',
          target: 'silly_comedy',
          group: true,
        }),
      ).toBe('gravado')
      expect(await act({ kind: 'adjust', link: 'cast', level: 'none' })).toBe(
        'ajustado',
      )
      expect(
        await act({
          kind: 'state',
          text: 'adoro os filmes dela',
          target: 'Q9000018',
          reaction: 'love',
        }),
      ).toBe('gravado')
      expect(await act({ kind: 'report', text: 'odeia filme lento' })).toBe(
        'gravado',
      )
      expect(
        await act({ kind: 'seen', film: 'tt9000602', rating: '4,5' }),
      ).toBe('gravado')
      expect(
        await act({
          kind: 'skip',
          text: 'a Iara curte terror?',
          subject: 'Q9001801',
        }),
      ).toBe('pulada')
      expect(
        await act({
          kind: 'skip',
          text: 'curte comédia boba?',
          subject: 'silly_comedy',
        }),
      ).toBe('pulada')

      const text = file()
      expect(text).toContain('nunca terror')
      expect(text).toContain('silly_comedy')
      expect(text).toContain('link: cast')
      expect(text).toContain(
        '2026-11-20 · conversa com o Dono · específico · ama Sofia Rangel (Q9000018) · "adoro os filmes dela"',
      )
      expect(text).toContain(
        '2026-11-20 · descrição de Bruno · genérico · "odeia filme lento"',
      )
      expect(text).toContain('Casa Cheia (tt9000602) · nota 4,5')

      const page = await personPage('iara', people, BRUNO)
      if (page === null || page === 'unknown') throw new Error(String(page))
      expect(page.openQuestions).toHaveLength(2)
      const terror = page.openQuestions.find((q) => q.subject === 'Q9001801')!
      expect(
        await act({
          kind: 'answer',
          question: terror.factId,
          text: 'não gosta',
          reaction: 'dislike',
        }),
      ).toBe('respondida')
      // Answered, it is no longer open.
      const again = await people.act(
        'iara',
        { kind: 'answer', question: terror.factId, text: 'de novo' },
        BRUNO,
      )
      expect(again.exitCode).toBe(1)

      const after = await personPage('iara', people, BRUNO)
      if (after === null || after === 'unknown') throw new Error(String(after))
      expect(after.openQuestions.map((q) => q.subject)).toEqual([
        'silly_comedy',
      ])
      expect(
        after.stated.map((s) => [s.text, s.reaction, s.target]),
      ).toContainEqual(['não gosta', 'dislike', 'Q9001801'])
      const removed = await people.act(
        'iara',
        { kind: 'remove', what: 'veto', id: after.vetoes[0]!.factId },
        BRUNO,
      )
      expect(removed).toEqual({ exitCode: 0, output: 'removido' })
      expect(file()).not.toContain('nunca terror')
      const skipped = await people.act(
        'iara',
        { kind: 'skip', text: 'curte comédia boba?', subject: 'silly_comedy' },
        BRUNO,
      )
      expect(skipped).toEqual({ exitCode: 0, output: 'saiu' })
    } finally {
      await engine.dispose()
    }

    const log = git(fixture.data, 'log', '--format=%an <%ae>|%s')
      .trim()
      .split('\n')
    expect(log.at(-1)).toBe('fixture <fixture@example.org>|initial')
    const writes = log.slice(0, -1)
    // Every write but the repeated Veto (nothing changed) and the second
    // answer (refused), one commit each;
    // the answer is two (the Declarado, then the question out).
    expect(writes).toHaveLength(12)
    for (const line of writes)
      expect(line).toMatch(/^Bruno <bruno@example\.org>\|pessoa /)
  }, 60_000) // twelve real git commits: slow on a loaded machine
})
