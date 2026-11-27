import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Outcome, SetupGuide } from '@filmes/engine'
import { describe, expect, it } from 'vite-plus/test'
import { Route as Skip } from '#/routes/inicio/pular'
import { openAuthDatabase } from './auth-database'
import {
  hasConnector,
  homeData,
  setupSkipAction,
  type LatestSession,
} from './setup-guide'

type Source = Parameters<typeof homeData>[1]

const BRUNO = {
  person: 'bruno',
  name: 'Bruno',
  email: 'bruno@example.org',
  admin: false,
}

const ORIGIN = 'http://localhost'

const DOWN: Outcome<never> = {
  exitCode: 1,
  output: { error: { code: 'missing_data', message: 'sem dados' } },
}

describe('hasConnector', () => {
  it('is true when the Claude app holds a grant for her email, in any case', () => {
    const db = openAuthDatabase(
      join(mkdtempSync(join(tmpdir(), 'auth-')), 'auth.sqlite'),
    )
    db.prepare(
      "INSERT INTO oauth_clients VALUES ('c', 'Claude', '[]', 0)",
    ).run()
    db.prepare(
      "INSERT INTO oauth_grants VALUES ('g', 'c', 'Bruno@Example.org', 'mcp', 'r', 0)",
    ).run()
    expect(hasConnector(db, 'bruno@example.org')).toBe(true)
    expect(hasConnector(db, 'vera@example.org')).toBe(false)
    db.close()
  })
})

const STEPS: SetupGuide['steps'] = [
  { step: 'taste', done: true, skipped: false },
  { step: 'import', done: false, skipped: true },
  { step: 'connector', done: false, skipped: false },
]

/** A guide that answers `guide` and records the steps it is asked to
 * skip. */
function fakeSource(complete = false, outcome?: Outcome<never>) {
  const skipped: string[] = []
  const source: Source = {
    guide: async () =>
      outcome ?? {
        exitCode: 0,
        output: { person: 'bruno', steps: STEPS, ratings: 4, complete },
      },
    skip: async (_owner, step) => {
      skipped.push(step)
      return { exitCode: 0, output: { person: 'bruno', step, new: true } }
    },
  }
  return { source, skipped }
}

const session = (id: string, attendees: string[]): LatestSession => ({
  id,
  date: id.slice(0, 10),
  request: null,
  attendees: attendees.map((person) => ({
    person,
    name: person,
    owner: false,
  })),
  recommendation: [],
  open: true,
  chosen: null,
  moods: [],
  constraints: [],
  version: 1,
  additions: [],
})

describe('homeData', () => {
  it('gives the steps, her Notas and the MCP URL', async () => {
    const home = await homeData(BRUNO, fakeSource().source, [], ORIGIN)
    expect(home).toEqual({
      person: 'bruno',
      setup: { steps: STEPS, ratings: 4 },
      latest: null,
      mcpUrl: 'http://localhost/mcp',
      today: null,
      covers: {},
    })
  })

  it('keeps the steps once every one is done or skipped', async () => {
    const home = await homeData(BRUNO, fakeSource(true).source, [], ORIGIN)
    expect(home.setup?.steps).toEqual(STEPS)
  })

  it('takes the latest Sessão the Dono was in', async () => {
    const list = [
      session('2026-11-20-1', ['iara']),
      session('2026-11-19-1', ['bruno', 'iara']),
      session('2026-11-18-1', ['bruno']),
    ]
    const home = await homeData(BRUNO, fakeSource().source, list, ORIGIN)
    expect(home.latest?.id).toBe('2026-11-19-1')
  })
})

describe('homeData, on the shelf and a failing engine', () => {
  it('asks the shelf for today and for the covers of the latest Sessão only', async () => {
    const asked: string[][] = []
    const home = await homeData(
      BRUNO,
      fakeSource().source,
      [session('2026-11-19-1', ['bruno'])],
      ORIGIN,
      {
        today: async () => '2026-11-20',
        covers: async (films) => {
          asked.push([...films])
          return { tt1: 'https://image.example/tt1.jpg' }
        },
      },
    )
    expect(home.today).toBe('2026-11-20')
    expect(home.covers).toEqual({ tt1: 'https://image.example/tt1.jpg' })
    expect(asked).toEqual([home.latest?.recommendation.map((f) => f.id)])
  })

  it('shows no guide and no Sessão when the engine cannot run', async () => {
    const home = await homeData(
      BRUNO,
      fakeSource(false, DOWN).source,
      null,
      undefined,
    )
    expect(home).toEqual({
      person: 'bruno',
      setup: null,
      latest: null,
      mcpUrl: null,
      today: null,
      covers: {},
    })
  })
})

const post = (
  fields: Record<string, string>,
  origin: string | null = ORIGIN,
) => {
  const body = new FormData()
  for (const [name, value] of Object.entries(fields)) body.set(name, value)
  return new Request('http://localhost/inicio/pular', {
    method: 'POST',
    body,
    headers: origin === null ? {} : { origin },
  })
}

describe('setupSkipAction', () => {
  it('skips the step as the Dono and goes home', async () => {
    const { source, skipped } = fakeSource()
    const response = await setupSkipAction(
      post({ passo: 'connector' }),
      BRUNO,
      source,
      ORIGIN,
    )
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/')
    expect(skipped).toEqual(['connector'])
  })

  it('sends whoever is not a Dono to the login, and refuses another site', async () => {
    const { source, skipped } = fakeSource()
    const login = await setupSkipAction(
      post({ passo: 'import' }),
      null,
      source,
      ORIGIN,
    )
    expect(login.headers.get('Location')).toBe('/entrar')
    const foreign = await setupSkipAction(
      post({ passo: 'import' }, 'https://elsewhere.example'),
      BRUNO,
      source,
      ORIGIN,
    )
    expect(foreign.status).toBe(403)
    expect(skipped).toEqual([])
  })

  it('goes home without writing for a step it does not know', async () => {
    const { source, skipped } = fakeSource()
    const response = await setupSkipAction(
      post({ passo: 'tour' }),
      BRUNO,
      source,
      ORIGIN,
    )
    expect(response.headers.get('Location')).toBe('/')
    expect(skipped).toEqual([])
  })

  it('goes home even when the engine cannot write', async () => {
    const { source } = fakeSource()
    const failing: Source = { ...source, skip: async () => DOWN }
    const response = await setupSkipAction(
      post({ passo: 'import' }),
      BRUNO,
      failing,
      ORIGIN,
    )
    expect(response.headers.get('Location')).toBe('/')
  })
})

describe('the skip route', () => {
  it('sends a form with no Dono session to the login', async () => {
    const handlers = Skip.options.server?.handlers as {
      POST: (ctx: { request: Request }) => Promise<Response>
    }
    const response = await handlers.POST({ request: post({ passo: 'import' }) })
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/entrar')
  })
})
