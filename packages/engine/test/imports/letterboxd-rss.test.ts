// The Letterboxd RSS import (ticket #100), the Vitest twin of
// tests/test_letterboxd_rss.py, plus the fetch over a fake `fetch` (no test
// leaves the machine). Olga's recorded feed is
// tests/fixture/gravacoes/letterboxd/rss-olga_farol.xml; the fixture's
// LEIAME says what each entry exercises. Where Python rebuilt the database,
// these reload the Letterboxd Fatos (`reloadLetterboxd`).
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { Effect, Fiber } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, test } from 'vite-plus/test'
import {
  discardQueueItem,
  fetchLetterboxdRss,
  Fetch,
  importLetterboxd,
  importLetterboxdRss,
  personCreate,
  personView,
  reloadLetterboxd,
  Sqlite,
  viewQueue,
  type Vars,
} from '../../src/index.ts'
import { ROOT, useFixture, type Fixture } from '../fixture.ts'
import { RECORDINGS } from '../sources/support.ts'
import { zipOf } from './zip.ts'

const RSS = join(RECORDINGS, 'letterboxd/rss-olga_farol.xml')
const OLGA = join(ROOT, 'tests/fixture/letterboxd/olga')
const SOURCE = 'RSS do Letterboxd de Olga'
const AUTHOR = { name: 'Dono', email: 'dono@example.org' }
const TMDB_ON: Vars = {
  FILMES_TMDB_CHAVE: 'chave-de-teste',
  FILMES_GRAVACOES: RECORDINGS,
}

const useOlga = async () => {
  const fixture = useFixture()
  await fixture.ok(personCreate({ name: 'Olga' }))
  return fixture
}

const importRss = (fixture: Fixture, user = 'olga_farol', vars: Vars = {}) =>
  fixture.ok(
    importLetterboxdRss({ person: 'olga', user, author: AUTHOR }),
    { ...TMDB_ON, ...vars },
  )

const query = (fixture: Fixture, sql: string) =>
  fixture.ok(
    Effect.gen(function* () {
      const rows = yield* (yield* Sqlite).read((db) => db.all(sql))
      return rows.map((row) => Object.values(row))
    }),
  )

const ratings = (fixture: Fixture) =>
  query(
    fixture,
    "SELECT filme_id, nota, data, fonte FROM notas WHERE pessoa = 'olga' ORDER BY data",
  )

const seen = (fixture: Fixture) =>
  query(
    fixture,
    "SELECT filme_id, data, fonte FROM ja_visto WHERE pessoa = 'olga' ORDER BY data",
  )

const olgaZip = () =>
  zipOf(
    readdirSync(OLGA)
      .filter((name) => name.endsWith('.csv'))
      .sort()
      .map((name) => [name, readFileSync(join(OLGA, name))] as const),
  )

const importZip = (fixture: Fixture) =>
  fixture.ok(
    importLetterboxd({
      person: 'olga',
      original: 'letterboxd-olga.zip',
      content: olgaZip(),
      author: AUTHOR,
    }),
    TMDB_ON,
  )

describe('importLetterboxdRss', () => {
  test('the RSS becomes diary and Notas, and its copy stays in filmes-dados', async () => {
    const fixture = await useOlga()
    const result = await importRss(fixture)

    expect(readFileSync(join(fixture.data, result.file))).toEqual(
      readFileSync(RSS),
    )
    const [record] = (await fixture.ok(personView('olga'))).imports
    expect(record).toMatchObject({
      kind: 'letterboxd-rss',
      original: 'https://letterboxd.com/olga_farol/rss/',
    })
    expect(await ratings(fixture)).toEqual([
      ['tt9000101', 4.5, '2024-01-10', SOURCE],
      ['tt9000102', 2, '2024-02-11', SOURCE],
      ['tt9000101', 5, '2024-05-05', SOURCE], // the rewatch is a Nota too
      ['tt9000302', 3.5, '2024-07-16', SOURCE],
    ])
    expect(await seen(fixture)).toHaveLength(5) // the list stays out
  })

  test("the RSS's TMDB id beats the slug", async () => {
    const fixture = await useOlga()
    await importRss(fixture)

    // Maré Baixa (2014): the slug with -2015 would give tt9000102; the RSS's
    // id 9002 is the 1980 namesake.
    const facts = await seen(fixture)
    expect(facts).toContainEqual(['tt9023002', '2024-03-01', SOURCE])
    // Vento Norte: the title has two TMDB candidates, but id 9102 has a
    // tconst.
    expect(facts).toContainEqual(['tt9000302', '2024-07-16', SOURCE])
    expect((await fixture.ok(viewQueue, TMDB_ON)).items).toEqual([])

    rmSync(join(fixture.root, 'filmes-cache.sqlite'))
    await fixture.ok(reloadLetterboxd)
    expect(await ratings(fixture)).toContainEqual([
      'tt9000302',
      3.5,
      '2024-07-16',
      SOURCE,
    ])
  })

  test('an entry without a diary date takes the day it was published, in its offset', async () => {
    const fixture = await useOlga()
    await importRss(fixture)
    // Vento Norte was published on 16/07/2024 at 21h (-03:00), already
    // 17/07 in UTC.
    expect(
      await query(
        fixture,
        "SELECT data FROM ja_visto WHERE pessoa = 'olga' AND filme_id = 'tt9000302'",
      ),
    ).toEqual([['2024-07-16']])
  })

  test('importing the RSS again, and the ZIP after it, repeat no Fato', async () => {
    const fixture = await useOlga()
    const first = await importRss(fixture)
    expect(first.newFacts).toEqual({
      ratings: 4,
      seen: 5,
      stated: 0,
      watchlist: 0,
    })
    const second = await importRss(fixture)
    expect(second.newFile).toBe(false)
    expect(Object.values(second.newFacts).every((n) => n === 0)).toBe(true)

    const zip = await importZip(fixture)
    // The ZIP repeats Farol (10/01), Maré Baixa (11/02) and Vento Norte
    // (16/07): those Notas and Já vistos existed and take the ZIP's Fonte.
    const notas = await ratings(fixture)
    expect(notas.filter((n) => n[2] === '2024-01-10')).toEqual([
      ['tt9000101', 4.5, '2024-01-10', 'Letterboxd de Olga'],
    ])
    expect(notas.filter((n) => n[2] === '2024-07-16')).toEqual([
      ['tt9000302', 3.5, '2024-07-16', 'Letterboxd de Olga'],
    ])
    expect(notas).toContainEqual(['tt9000101', 5, '2024-05-05', SOURCE]) // only the RSS has the rewatch
    expect(zip.newFacts.ratings).toBe(2) // Rio Abaixo and Noite d'Estreia
    const facts = await seen(fixture)
    expect(new Set(facts.map(([f, d]) => `${f} ${d}`)).size).toBe(facts.length)
  })

  test("the Dono's decision comes before the TMDB id", async () => {
    const fixture = await useOlga()
    await importZip(fixture)
    const vento = (await fixture.ok(viewQueue, TMDB_ON)).items.find(
      (i) => i.name === 'Vento Norte',
    )
    await fixture.ok(
      discardQueueItem({
        id: vento?.id ?? '',
        reason: 'não lembro de ter visto',
        author: AUTHOR,
      }),
    )

    await importRss(fixture)
    expect(
      await query(
        fixture,
        "SELECT count(*) FROM ja_visto WHERE pessoa = 'olga' AND filme_id = 'tt9000302'",
      ),
    ).toEqual([[0]])
  })

  test('a user with no RSS records nothing', async () => {
    const fixture = await useOlga()
    const op = (user: string) =>
      fixture.run(
        importLetterboxdRss({ person: 'olga', user, author: AUTHOR }),
        TMDB_ON,
      )
    expect(await op('ninguem_aqui')).toEqual({
      exitCode: 1,
      output: {
        error: {
          code: 'missing_rss',
          message:
            'o Letterboxd não tem o usuário ninguem_aqui (ou o perfil é privado)',
        },
      },
    })
    expect(await op('../olga')).toEqual({
      exitCode: 2,
      output: {
        error: {
          code: 'invalid_usage',
          message: "usuário do Letterboxd inválido: '../olga'",
        },
      },
    })
    expect((await fixture.ok(personView('olga'))).imports).toEqual([])
    expect(existsSync(join(fixture.data, 'imports/olga'))).toBe(false)
  })
})

/** A `fetch` that answers with `answer` and keeps each call. */
const fakeFetch = (answer: () => Promise<Response>) => {
  const calls: { url: string; headers: unknown }[] = []
  const fetch = (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), headers: init?.headers })
    return answer()
  }
  return { fetch: fetch as typeof globalThis.fetch, calls }
}

const NETWORK: Vars = { FILMES_GRAVACOES: undefined }

describe('fetchLetterboxdRss', () => {
  const fetchWith = (fixture: Fixture, answer: () => Promise<Response>) => {
    const net = fakeFetch(answer)
    return {
      net,
      outcome: fixture.run(
        Effect.provideService(
          fetchLetterboxdRss('olga_farol'),
          Fetch,
          net.fetch,
        ),
        NETWORK,
      ),
    }
  }

  test("asks the user's feed and answers its bytes", async () => {
    const fixture = useFixture()
    const { net, outcome } = fetchWith(fixture, () =>
      Promise.resolve(new Response(readFileSync(RSS))),
    )
    const result = await outcome
    expect(result.exitCode).toBe(0)
    expect(Buffer.from(result.output as Uint8Array)).toEqual(
      readFileSync(RSS),
    )
    expect(net.calls).toEqual([
      {
        url: 'https://letterboxd.com/olga_farol/rss/',
        headers: { 'User-Agent': 'filmes' },
      },
    ])
  })

  test.each([
    [
      () => Promise.resolve(new Response('', { status: 404 })),
      'missing_rss',
      'o Letterboxd não tem o usuário olga_farol (ou o perfil é privado)',
    ],
    [
      () => Promise.resolve(new Response('', { status: 503 })),
      'source_unavailable',
      'o Letterboxd respondeu HTTP 503 ao RSS de olga_farol',
    ],
    [
      () =>
        Promise.reject(
          new TypeError('fetch failed', {
            cause: new Error('getaddrinfo ENOTFOUND letterboxd.com'),
          }),
        ),
      'source_unavailable',
      'não deu para baixar o RSS de olga_farol: getaddrinfo ENOTFOUND letterboxd.com',
    ],
  ])('a failure is an error: %#', async (answer, code, message) => {
    const fixture = useFixture()
    expect(await fetchWith(fixture, answer).outcome).toEqual({
      exitCode: 1,
      output: { error: { code, message } },
    })
  })

  test('gives up after 20 seconds', async () => {
    const fixture = useFixture()
    const net = fakeFetch(() => new Promise<Response>(() => {}))
    const error = await fixture.ok(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          Effect.flip(
            Effect.provideService(
              fetchLetterboxdRss('olga_farol'),
              Fetch,
              net.fetch,
            ),
          ),
        )
        yield* TestClock.adjust('20 seconds')
        return yield* Fiber.join(fiber)
      }).pipe(Effect.provide(TestClock.layer())),
      NETWORK,
    )
    expect(error.message).toBe(
      'não deu para baixar o RSS de olga_farol: timed out',
    )
  })
})
