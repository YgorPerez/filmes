// Reading a Pessoa's Trakt by the API (#269): a public username with the
// client id alone, her connected account with its token, and the read a new
// Session makes for its Presentes. Trakt answers from
// tests/fixture/gravacoes/trakt (`get-<user>-<list>`), never the network:
// Teo's profile is the same as his Raw Export in tests/fixture/trakt.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import {
  importTrakt,
  makeEngine,
  personImports,
  recommendSession,
  syncTrakt,
  TRAKT_REVOKED,
  type Engine,
  type TraktConnection,
} from '../../src/index.ts'
import { ROOT, useFixture, type Fixture } from '../fixture.ts'
import { zipOf } from './zip.ts'

const AUTHOR = { name: 'Dono', email: 'dono@example.org' }
const RECORDINGS = join(ROOT, 'tests/fixture/gravacoes')

/** An engine whose Trakt connection has a token for `connected` only. */
const withTrakt = (
  fixture: Fixture,
  connected: readonly string[] = [],
): Engine => {
  const connection: TraktConnection = {
    clientId: 'fixture',
    accessToken: async (person) =>
      connected.includes(person) ? 'fixture-token' : null,
  }
  return makeEngine(
    { ...fixture.vars, FILMES_GRAVACOES: RECORDINGS },
    { trakt: connection },
  )
}

/** An engine whose Trakt refuses the grants of `revoked`: the app drops a
 * refused grant, so the next ask finds her not connected. */
const withRevoked = (fixture: Fixture, revoked: readonly string[]): Engine => {
  const dropped = new Set<string>()
  const connection: TraktConnection = {
    clientId: 'fixture',
    accessToken: async (person) => {
      if (!revoked.includes(person) || dropped.has(person)) return null
      dropped.add(person)
      return TRAKT_REVOKED
    },
  }
  return makeEngine(
    { ...fixture.vars, FILMES_GRAVACOES: RECORDINGS },
    { trakt: connection },
  )
}

const RECONNECT = (name: string) =>
  `O Trakt de ${name} recusou a conexão; reconecte o Trakt para voltar a ler e enviar o histórico.`

const using = async <A>(engine: Engine, task: (e: Engine) => Promise<A>) => {
  try {
    return await task(engine)
  } finally {
    await engine.dispose()
  }
}

const sync = (person: string, user?: string) =>
  syncTrakt({ person, user, author: AUTHOR })

describe('syncTrakt', () => {
  test('reads a public profile by its username and keeps it', async () => {
    const fixture = useFixture()
    const done = await using(withTrakt(fixture), async (engine) => {
      const first = await engine.run(sync('teo', '@teo_trakt'))
      // Unchanged since: the same snapshot, nothing new, and the
      // username is remembered.
      const again = await engine.run(sync('teo'))
      return { first, again }
    })
    expect(done.first).toMatchObject({
      exitCode: 0,
      output: {
        user: 'teo_trakt',
        newFile: true,
        newFacts: { ratings: 2, seen: 1, watchlist: 0 },
      },
    })
    expect(done.again).toMatchObject({
      exitCode: 0,
      output: { newFile: false, newFacts: { ratings: 0, seen: 0 } },
    })
    const page = await fixture.ok(personImports('teo'))
    expect(page.trakt).toEqual({ ratings: 2, seen: 1, watchlist: 0 })
    const [record] = page.imports.filter((i) => i.kind === 'trakt-api')
    expect(record?.original).toBe('@teo_trakt')
    expect(existsSync(join(fixture.data, String(record?.file)))).toBe(true)
  })

  test('is one Fato with the ZIP of the same plays', async () => {
    const fixture = useFixture()
    const zip = zipOf(
      ['ratings-movies.json', 'watched-history-1.json'].map(
        (name) =>
          [
            `trakt-export/${name}`,
            readFileSync(join(ROOT, 'tests/fixture/trakt', name)),
          ] as const,
      ),
    )
    await fixture.ok(
      importTrakt({
        person: 'teo',
        original: 'trakt.zip',
        content: zip,
        author: AUTHOR,
      }),
    )
    const synced = await using(withTrakt(fixture), (engine) =>
      engine.run(sync('teo', 'teo_trakt')),
    )
    expect(synced).toMatchObject({
      output: { newFacts: { ratings: 0, seen: 0, watchlist: 0 } },
    })
  })

  test('reads the connected account with its token, and keeps one snapshot', async () => {
    const fixture = useFixture()
    await using(withTrakt(fixture, ['teo']), async (engine) => {
      expect(await engine.run(sync('teo', 'teo_trakt'))).toMatchObject({
        exitCode: 0,
      })
      expect(await engine.run(sync('teo'))).toMatchObject({
        exitCode: 0,
        output: { user: 'me' },
      })
    })
    const page = await fixture.ok(personImports('teo'))
    expect(
      page.imports.filter((i) => i.kind === 'trakt-api').map((i) => i.original),
    ).toEqual(['conta conectada'])
    expect(page.trakt).toEqual({ ratings: 2, seen: 1, watchlist: 0 })
  })

  test('says why it cannot read', async () => {
    const fixture = useFixture()
    const reasons = await using(withTrakt(fixture), async (engine) =>
      Promise.all(
        [
          sync('teo', 'ninguem_aqui'),
          sync('teo', 'privado'),
          sync('teo', 'não vale'),
          sync('teo'),
        ].map(async (effect) => {
          const outcome = await engine.run(effect)
          return outcome.exitCode === 0 ? null : outcome.output.error.reason
        }),
      ),
    )
    expect(reasons).toEqual([
      'trakt_user_missing',
      'trakt_private',
      'trakt_user_missing',
      'trakt_not_linked',
    ])
    // A server with no Trakt client id.
    const off = await fixture.run(sync('teo', 'teo_trakt'))
    expect(off.exitCode === 0 ? null : off.output.error.reason).toBe(
      'trakt_off',
    )
  })

  test('a refused grant falls back to her username and asks to reconnect', async () => {
    const fixture = useFixture()
    await using(withTrakt(fixture), (engine) =>
      engine.run(sync('teo', 'teo_trakt')),
    )
    const synced = await using(withRevoked(fixture, ['teo']), (engine) =>
      engine.run(sync('teo')),
    )
    expect(synced).toMatchObject({
      exitCode: 0,
      output: { user: 'teo_trakt', warnings: [RECONNECT('Teo')] },
    })
  })

  test('a refused grant with no username asks to reconnect', async () => {
    const fixture = useFixture()
    const refused = await using(withRevoked(fixture, ['iara']), (engine) =>
      engine.run(sync('iara')),
    )
    expect(refused).toMatchObject({
      exitCode: 2,
      output: {
        error: { reason: 'trakt_not_linked', message: RECONNECT('Iara') },
      },
    })
  })

  test('a read that works has no warning', async () => {
    const fixture = useFixture()
    const synced = await using(withTrakt(fixture), (engine) =>
      engine.run(sync('teo', 'teo_trakt')),
    )
    expect(synced.output).not.toHaveProperty('warnings')
  })
})

test('a new Session reads the Trakt of its linked Presentes first', async () => {
  const fixture = useFixture()
  await using(withTrakt(fixture), (engine) =>
    engine.run(sync('teo', 'teo_trakt')),
  )
  // Teo is linked by his username, Iara by her connection: both are read
  // before the Session ranks; Bruno has neither and is left alone.
  await using(withTrakt(fixture, ['iara']), async (engine) => {
    const open = await engine.run(
      recommendSession({ attendees: ['dono', 'iara', 'teo'] }),
    )
    expect(open.exitCode).toBe(0)
    if (open.exitCode !== 0) return
    expect(open.output).not.toHaveProperty(
      'warnings',
      expect.arrayContaining([expect.stringContaining('Trakt')]),
    )
  })
  const iara = await fixture.ok(personImports('iara'))
  expect(
    iara.imports.filter((i) => i.kind === 'trakt-api').map((i) => i.original),
  ).toEqual(['conta conectada'])
  expect(iara.trakt).toMatchObject({ ratings: 2, seen: 1 })
})

test('a new Session says whose Trakt grant was refused', async () => {
  const fixture = useFixture()
  await using(withTrakt(fixture), (engine) =>
    engine.run(sync('teo', 'teo_trakt')),
  )
  // Teo still has his username, and his Trakt is read by it; Iara has
  // nothing else, and her read is left out. Both are asked to reconnect.
  const open = await using(withRevoked(fixture, ['iara', 'teo']), (engine) =>
    engine.run(recommendSession({ attendees: ['dono', 'iara', 'teo'] })),
  )
  expect(open).toMatchObject({
    exitCode: 0,
    output: {
      warnings: expect.arrayContaining([RECONNECT('Iara'), RECONNECT('Teo')]),
    },
  })
  if (open.exitCode !== 0) return
  expect(
    open.output.warnings?.filter((warning) => warning.includes('Trakt')),
  ).toEqual([RECONNECT('Iara'), RECONNECT('Teo')])
})
