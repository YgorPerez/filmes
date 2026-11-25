import { execFileSync } from 'node:child_process'
import {
  makeEngine,
  recommendSession,
  type ErrorCode,
  type Outcome,
} from '@filmes/engine'
import { describe, expect, it, vi } from 'vite-plus/test'
import { useFixture } from '../../../packages/engine/test/fixture.ts'
import { MODEL } from '#/ui/billboard.fixture'
import {
  billboardsFromEngine,
  cartazPage,
  replyAction,
  type Billboards,
} from './billboard'
import { Notes } from './notes'
import type { SessionItem, Sessions } from './sessions'

const BRUNO = { person: 'bruno' }
const ORIGIN = 'http://localhost'
const ID = '2026-11-20-iara'

const failure = (code: ErrorCode, message = `mensagem de ${code}`) =>
  ({ exitCode: 1, output: { error: { code, message } } }) as Outcome<never>

const SESSION: SessionItem = {
  id: ID,
  date: '2026-11-20',
  request: null,
  attendees: [],
  recommendation: [],
  open: true,
  chosen: null,
  moods: [],
  constraints: [],
}

const sessions = (list: Outcome<SessionItem[]>): Sessions => ({
  list: async () => list,
  options: async () => failure('missing_database'),
  open: async () => failure('missing_database'),
})

function fake(answer?: Awaited<ReturnType<Billboards['answer']>>) {
  const answered = vi.fn<Billboards['answer']>(
    async () =>
      answer ?? {
        exitCode: 0,
        output: { regenerated: true, note: { warnings: [], addition: null } },
      },
  )
  const billboards: Billboards = {
    model: async () => ({
      exitCode: 0,
      output: { model: MODEL, warnings: ['sem chave do TMDB'] },
    }),
    answer: answered,
  }
  return { billboards, answered }
}

const post = (text: string | null, origin = ORIGIN) => {
  const body = new FormData()
  if (text !== null) body.append('texto', text)
  return new Request(`${ORIGIN}/sessoes/${ID}/responder`, {
    method: 'POST',
    body,
    headers: { origin },
  })
}

const MARKED = `#cartaz ${ID} v2\n1 tt9000104 · trocar\n`

describe('replyAction', () => {
  const act = (
    request: Request,
    billboards: Billboards,
    notes = new Notes(),
    owner: typeof BRUNO | null = BRUNO,
  ) => replyAction(request, owner, ID, billboards, notes, ORIGIN)

  it('records the reply as the Dono and says it was redone', async () => {
    const { billboards, answered } = fake()
    const response = await act(post(MARKED), billboards)
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe(
      `/sessoes/${ID}?feito=regerada`,
    )
    expect(answered).toHaveBeenCalledWith(ID, MARKED, 'bruno')
  })

  it('keeps the warnings and the acrescentar in a note for the page', async () => {
    const note = { warnings: ['só 1 passou'], addition: 'chegou a Ana' }
    const { billboards } = fake({
      exitCode: 0,
      output: { regenerated: false, note },
    })
    const notes = new Notes()
    const location =
      (await act(post(MARKED), billboards, notes)).headers.get('Location') ?? ''
    expect(location).toMatch(
      new RegExp(`^/sessoes/${ID}\\?feito=anotada&nota=`),
    )
    expect(notes.recall(location.split('nota=')[1])).toEqual(note)
  })

  it('sends nothing with no mark, and only for a Dono of this site', async () => {
    const { billboards, answered } = fake()
    for (const text of [null, `#cartaz ${ID} v2\n`])
      expect((await act(post(text), billboards)).headers.get('Location')).toBe(
        `/sessoes/${ID}?erro=nada`,
      )
    expect(
      (await act(post(MARKED), billboards, new Notes(), null)).headers.get(
        'Location',
      ),
    ).toBe('/entrar')
    expect(
      (await act(post(MARKED, 'https://evil.example'), billboards)).status,
    ).toBe(403)
    expect(answered).not.toHaveBeenCalled()
  })

  it.each<[ErrorCode, 'answer' | 'redo', string, boolean]>([
    ['invalid_usage', 'answer', 'texto', false],
    ['closed_session', 'answer', 'fechada', false],
    ['unknown_session', 'answer', 'indisponivel', true],
    ['invalid_usage', 'redo', 'regerar', true],
    ['closed_session', 'redo', 'fechada', false],
  ])('says why: %s at %s', async (code, stage, refusal, logged) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { billboards } = fake({ ...failure(code), stage })
    expect((await act(post(MARKED), billboards)).headers.get('Location')).toBe(
      `/sessoes/${ID}?erro=${refusal}`,
    )
    expect(log.mock.calls.length > 0).toBe(logged)
    log.mockRestore()
  })
})

describe('cartazPage', () => {
  it('has the Session, its Cartaz, and the note’s and the sources’ warnings once', async () => {
    const notes = new Notes()
    const token = notes.remember({
      warnings: ['só 1 passou', 'sem chave do TMDB'],
      addition: 'chegou a Ana',
    })
    expect(
      await cartazPage(
        ID,
        token,
        sessions({ exitCode: 0, output: [SESSION] }),
        fake().billboards,
        notes,
      ),
    ).toEqual({
      session: SESSION,
      billboard: MODEL,
      warnings: ['só 1 passou', 'sem chave do TMDB'],
      addition: 'chegou a Ana',
    })
  })

  it('is unknown, null, or without a Cartaz (logged) when the engine says so', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { billboards } = fake()
    const notes = new Notes()
    expect(
      await cartazPage(
        'x',
        undefined,
        sessions({ exitCode: 0, output: [SESSION] }),
        billboards,
        notes,
      ),
    ).toBe('unknown')
    expect(
      await cartazPage(
        ID,
        undefined,
        sessions(failure('missing_database')),
        billboards,
        notes,
      ),
    ).toBeNull()
    const broken: Billboards = {
      ...billboards,
      model: async () => failure('invalid_data'),
    }
    expect(
      await cartazPage(
        ID,
        'gone',
        sessions({ exitCode: 0, output: [SESSION] }),
        broken,
        notes,
      ),
    ).toEqual({
      session: SESSION,
      billboard: null,
      warnings: [],
      addition: null,
    })
    expect(log).toHaveBeenCalledWith(
      'engine: invalid_data: mensagem de invalid_data',
    )
    log.mockRestore()
  })
})

describe('Notes', () => {
  it('keep nothing to say, and forget after half an hour', () => {
    let now = 0
    const notes = new Notes(() => now)
    expect(notes.remember({ warnings: [], addition: null })).toBeUndefined()
    const token = notes.remember({ warnings: ['a'], addition: null })
    now = 29 * 60 * 1000
    expect(notes.recall(token)).toEqual({ warnings: ['a'], addition: null })
    now = 31 * 60 * 1000
    expect(notes.recall(token)).toBeNull()
    expect(notes.recall(undefined)).toBeNull()
  })

  it('keep at most 200, forgetting the oldest', () => {
    const notes = new Notes(() => 0)
    const first = notes.remember({ warnings: ['0'], addition: null })
    for (let i = 1; i <= 201; i++)
      notes.remember({ warnings: [String(i)], addition: null })
    expect(notes.recall(first)).toBeNull()
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

const lastCommits = (cwd: string, n: number) =>
  execFileSync('git', ['log', `-${n}`, '--format=%an|%s'], {
    cwd,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')

describe('billboardsFromEngine', () => {
  it('answers as the Dono, redoes with the films that stay, and only notes stars', async () => {
    const fixture = useFixture()
    commitAll(fixture.data)
    const engine = makeEngine(fixture.vars)
    try {
      const opened = await engine.run(
        recommendSession({ attendees: ['bruno', 'iara'], count: 3 }),
        { owner: 'bruno' },
      )
      if (opened.exitCode !== 0) throw new Error('not opened')
      const id = opened.output.session.id
      const [first, second, third] = opened.output.films.map((f) => f.id)
      const billboards = billboardsFromEngine(engine)
      const made = await billboards.model(id)
      expect(made.exitCode === 0 && made.output.model.version).toBe(1)

      const swapped = await billboards.answer(
        id,
        `#cartaz ${id} v1\n2 ${second} · trocar\n3 ${third} · estrelas: 4\n`,
        'bruno',
      )
      expect(swapped).toMatchObject({
        exitCode: 0,
        output: { regenerated: true },
      })
      expect(lastCommits(fixture.data, 2)).toEqual([
        `Bruno|redo session ${id}`,
        `Bruno|answer billboard ${id}`,
      ])
      const redone = await billboards.model(id)
      if (redone.exitCode !== 0) throw new Error('no model')
      const { model } = redone.output
      expect(model.version).toBe(2)
      expect(model.dropped.map((d) => [d.id, d.reason])).toEqual([
        [second, 'trocado'],
      ])
      expect(model.films.find((f) => f.id === first)).toMatchObject({
        position: 1,
        new: false,
      })
      expect(model.films.find((f) => f.id === third)).toMatchObject({
        position: 3,
        new: false,
      })
      expect(model.films.some((f) => f.id === second)).toBe(false)

      const noted = await billboards.answer(
        id,
        `#cartaz ${id} v2\n1 ${first} · estrelas: 5\n`,
        'bruno',
      )
      expect(noted).toMatchObject({
        exitCode: 0,
        output: { regenerated: false },
      })

      const wrong = await billboards.answer(id, `#cartaz outra v1\n`, 'bruno')
      expect(wrong).toMatchObject({ exitCode: 2, stage: 'answer' })
    } finally {
      await engine.dispose()
    }
  }, 60_000) // real git commits: slow on a loaded machine
})
