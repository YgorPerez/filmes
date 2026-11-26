// The on-demand sources over the network, with a fake `fetch` in place of
// the network (no test leaves the machine) and a `TestClock` for the pauses
// between tries: what each API is asked, how its answers and failures are
// read, the 2 s and 4 s backoff and the 10 s timeout.

import { Effect, Fiber } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, test } from 'vite-plus/test'
import { DoesTheDogDie, Fetch, findTopic, Omdb, Tmdb } from '../../src/index.ts'
import { useFixture } from '../fixture.ts'
import { cacheRows, withWarnings } from './support.ts'
import { join } from 'node:path'

interface Call {
  readonly url: string
  readonly headers: Readonly<Record<string, string>>
  /** The test clock's time when it was made, in ms. */
  readonly at: number
}

type Answer = Response | Promise<Response>

/** A `fetch` that answers with `answer` and keeps every call. */
const fakeFetch = (
  answer: (url: string, call: number, signal: AbortSignal) => Answer,
  now: () => number = () => 0,
) => {
  const calls: Call[] = []
  const fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    calls.push({
      url,
      headers: { ...(init?.headers as Record<string, string>) },
      at: now(),
    })
    return Promise.resolve(
      answer(url, calls.length, init?.signal ?? new AbortController().signal),
    )
  }
  return { fetch: fetch as typeof globalThis.fetch, calls }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status })

const KEYS = {
  FILMES_OMDB_CHAVE: 'omdb-key',
  FILMES_DDD_CHAVE: 'ddd-key',
  FILMES_TMDB_CHAVE: 'tmdb-key',
} as const

const OMDB_OUT = (reason: string) =>
  `OMDb não respondeu (${reason}); filmes sem classificação local saem da Sessão com criança`

const ageRating = (imdbId: string) =>
  Effect.flatMap(Effect.service(Omdb), (omdb) => omdb.ageRating(imdbId))

/** Runs `effect` with `fetch` as the network. */
const over =
  (fetch: typeof globalThis.fetch) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provideService(effect, Fetch, fetch)

describe('OMDb', () => {
  test('asks by IMDb id with the key, and caches the answer', async () => {
    const fixture = useFixture()
    const net = fakeFetch(() =>
      json({ Title: 'Vento Norte', Rated: ' PG ', Response: 'True' }),
    )

    const first = await fixture.ok(
      over(net.fetch)(ageRating('tt9000302')),
      KEYS,
    )
    const again = await fixture.ok(
      over(net.fetch)(ageRating('tt9000302')),
      KEYS,
    )

    expect(first).toEqual({
      rated: 'PG',
      date: '2026-11-20',
      factId: 'omdb:tt9000302',
    })
    expect(again).toEqual(first)
    expect(net.calls).toEqual([
      {
        url: 'https://www.omdbapi.com/?i=tt9000302&apikey=omdb-key',
        headers: { Accept: 'application/json', 'User-Agent': 'filmes' },
        at: 0,
      },
    ])
  })

  test('"Movie not found!" and a 404 leave only that film without a rating', async () => {
    const fixture = useFixture()
    const net = fakeFetch((url) =>
      url.includes('tt1')
        ? json({ Response: 'False', Error: 'Movie not found!' })
        : new Response('', { status: 404 }),
    )

    const answer = await fixture.ok(
      over(net.fetch)(
        withWarnings(Effect.all([ageRating('tt1'), ageRating('tt2')])),
      ),
      KEYS,
    )

    expect(answer).toEqual({ value: [undefined, undefined], warnings: [] })
    expect(
      cacheRows(join(fixture.root, 'filmes-cache.sqlite')).map(
        (row) => row['corpo'],
      ),
    ).toEqual([
      { Response: 'False', Error: 'Movie not found!' },
      { Response: 'False', Error: 'Movie not found!' },
    ])
  })
})

describe('OMDb', () => {
  test.each(['Invalid API key!', 'Request limit reached!'])(
    '"%s" switches OMDb off at once, for every film',
    async (error) => {
      const fixture = useFixture()
      const net = fakeFetch(() => json({ Response: 'False', Error: error }))

      const answer = await fixture.ok(
        over(net.fetch)(
          withWarnings(Effect.all([ageRating('tt1'), ageRating('tt2')])),
        ),
        KEYS,
      )

      expect(answer).toEqual({
        value: [undefined, undefined],
        warnings: [OMDB_OUT(error)],
      })
      expect(net.calls).toHaveLength(1)
      expect(cacheRows(join(fixture.root, 'filmes-cache.sqlite'))).toEqual([])
    },
  )

  test('a body that is not JSON is not tried again', async () => {
    const fixture = useFixture()
    const net = fakeFetch(() => new Response('<html>', { status: 200 }))

    const answer = await fixture.ok(
      over(net.fetch)(withWarnings(ageRating('tt1'))),
      KEYS,
    )

    expect(answer).toEqual({
      value: undefined,
      warnings: [OMDB_OUT('resposta não é JSON')],
    })
    expect(net.calls).toHaveLength(1)
  })

  test('another 4xx is not tried again', async () => {
    const fixture = useFixture()
    const net = fakeFetch(() => new Response('', { status: 401 }))

    const answer = await fixture.ok(
      over(net.fetch)(withWarnings(ageRating('tt1'))),
      KEYS,
    )

    expect(answer).toEqual({
      value: undefined,
      warnings: [OMDB_OUT('HTTP 401')],
    })
    expect(net.calls).toHaveLength(1)
  })
})

/** Runs `effect` in a fiber and moves the test clock a second at a time
 * until it ends; `fetch` stamps each call with the test clock's time. */
const withBackoff = <A, E, R>(
  answer: (url: string, call: number, signal: AbortSignal) => Answer,
  effect: Effect.Effect<A, E, R>,
) =>
  Effect.gen(function* () {
    const clock = yield* TestClock.testClockWith(Effect.succeed)
    const net = fakeFetch(answer, () => clock.currentTimeMillisUnsafe())
    const fiber = yield* Effect.forkChild(over(net.fetch)(withWarnings(effect)))
    for (
      let second = 0;
      second < 60 && fiber.pollUnsafe() === undefined;
      second++
    )
      yield* TestClock.adjust('1 second')
    const result = yield* Fiber.join(fiber)
    return { ...result, at: net.calls.map((call) => call.at) }
  }).pipe(Effect.provide(TestClock.layer()))

describe('transient failures', () => {
  test.each([503, 500, 429])(
    'HTTP %s is tried three times, 2 s and then 4 s apart',
    async (status) => {
      const fixture = useFixture()

      const answer = await fixture.ok(
        withBackoff(() => new Response('', { status }), ageRating('tt1')),
        KEYS,
      )

      expect(answer).toEqual({
        value: undefined,
        warnings: [OMDB_OUT(`HTTP ${status}`)],
        at: [0, 2000, 6000],
      })
    },
  )

  test('a try that succeeds ends the wait, and its answer is cached', async () => {
    const fixture = useFixture()

    const answer = await fixture.ok(
      withBackoff(
        (_, call) =>
          call < 3
            ? new Response('', { status: 502 })
            : json({ Response: 'True', Rated: 'R' }),
        ageRating('tt1'),
      ),
      KEYS,
    )

    expect(answer).toEqual({
      value: { rated: 'R', date: '2026-11-20', factId: 'omdb:tt1' },
      warnings: [],
      at: [0, 2000, 6000],
    })
  })
})

describe('transient failures', () => {
  test('a dropped connection is transient, and the warning names its cause', async () => {
    const fixture = useFixture()
    const refused = () =>
      Promise.reject(
        new TypeError('fetch failed', {
          cause: new Error('connect ECONNREFUSED 127.0.0.1:443'),
        }),
      )

    const answer = await fixture.ok(
      withBackoff(refused, ageRating('tt1')),
      KEYS,
    )

    expect(answer).toEqual({
      value: undefined,
      warnings: [OMDB_OUT('connect ECONNREFUSED 127.0.0.1:443')],
      at: [0, 2000, 6000],
    })
  })

  test('a request gets 10 s, and then it is a transient failure', async () => {
    const fixture = useFixture()
    const aborted: boolean[] = []
    const hang = (_: string, __: number, signal: AbortSignal) =>
      new Promise<Response>((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          aborted.push(true)
          reject(new Error('aborted'))
        })
      })

    const answer = await fixture.ok(withBackoff(hang, ageRating('tt1')), KEYS)

    expect(answer).toEqual({
      value: undefined,
      warnings: [OMDB_OUT('timed out')],
      at: [0, 12000, 26000],
    })
    expect(aborted).toEqual([true, true, true])
  })
})

describe('Does the Dog Die', () => {
  test('searches by IMDb id, then reads the film page, with the key in a header', async () => {
    const fixture = useFixture()
    const page = {
      item: { id: 7105 },
      topicItemStats: [
        {
          topic: { id: 153, name: 'a dog dies', doesName: 'Does the dog die' },
          yesSum: '3',
          noSum: null,
        },
        { topic: { id: 154 }, yesSum: 9, noSum: 9 },
      ],
    }
    const net = fakeFetch((url) =>
      url.includes('dddsearch')
        ? json({ items: [{ id: 7105 }, { id: 1 }] })
        : json(page),
    )

    const topics = await fixture.ok(
      over(net.fetch)(
        Effect.flatMap(Effect.service(DoesTheDogDie), (ddd) =>
          ddd.topics('tt9000105'),
        ),
      ),
      KEYS,
    )

    expect(topics && findTopic(topics, 'a dog dies')).toEqual({
      name: 'a dog dies',
      yes: 3,
      no: 0,
    })
    expect(topics?.byKey.size).toBe(3)
    expect(
      net.calls.map(({ url, headers }) => [url, headers['X-API-KEY']]),
    ).toEqual([
      ['https://www.doesthedogdie.com/dddsearch?imdb=tt9000105', 'ddd-key'],
      ['https://www.doesthedogdie.com/media/7105', 'ddd-key'],
    ])
  })
})

describe('Does the Dog Die', () => {
  test.each([
    ['no item', () => json({ items: [] })],
    ['a 404', () => new Response('', { status: 404 })],
  ])('%s is a film without topics, cached as {}', async (_, answer) => {
    const fixture = useFixture()
    const net = fakeFetch(answer)

    const topics = await fixture.ok(
      over(net.fetch)(
        Effect.flatMap(Effect.service(DoesTheDogDie), (ddd) =>
          ddd.topics('tt1'),
        ),
      ),
      KEYS,
    )

    expect(topics).toBeUndefined()
    expect(net.calls).toHaveLength(1)
    expect(
      cacheRows(join(fixture.root, 'filmes-cache.sqlite')).map(
        (row) => row['corpo'],
      ),
    ).toEqual([{}])
  })

  test('a page that 404s after the search is a film without topics', async () => {
    const fixture = useFixture()
    const net = fakeFetch((url) =>
      url.includes('dddsearch')
        ? json({ items: [{ id: 5 }] })
        : new Response('', { status: 404 }),
    )

    const topics = await fixture.ok(
      over(net.fetch)(
        Effect.flatMap(Effect.service(DoesTheDogDie), (ddd) =>
          ddd.topics('tt1'),
        ),
      ),
      KEYS,
    )

    expect(topics).toBeUndefined()
    expect(net.calls).toHaveLength(2)
  })
})

describe('TMDB', () => {
  const page = (n: number, total: number) =>
    json({
      page: n,
      total_pages: total,
      results: [{ id: n * 10 }, { id: n * 10 + 1 }],
    })

  test('a search reads every page into one cached entry, with a v3 key in the query', async () => {
    const fixture = useFixture()
    const net = fakeFetch((url) =>
      page(Number(new URL(url).searchParams.get('page') ?? 1), 3),
    )

    const films = await fixture.ok(
      over(net.fetch)(
        Effect.flatMap(Effect.service(Tmdb), (tmdb) =>
          tmdb.movies('Ação & Reação', 2020),
        ),
      ),
      KEYS,
    )

    expect(films).toEqual([10, 11, 20, 21, 30, 31].map((id) => ({ id })))
    const base =
      'https://api.themoviedb.org/3/search/movie?query=A%C3%A7%C3%A3o+%26+Rea%C3%A7%C3%A3o&primary_release_year=2020&include_adult=false&api_key=tmdb-key'
    expect(net.calls.map((call) => call.url)).toEqual([
      base,
      `${base}&page=2`,
      `${base}&page=3`,
    ])
    expect(net.calls[0]?.headers['Authorization']).toBeUndefined()
    const [row] = cacheRows(join(fixture.root, 'filmes-cache.sqlite'))
    expect(row?.['chave']).toMatch(/^filme-acao-reacao-2020-[0-9a-f]{12}$/)
    expect(row?.['expira_em']).toBe('2027-05-21')
  })
})

describe('TMDB', () => {
  test('a v4 token goes in the Authorization header', async () => {
    const fixture = useFixture()
    const token = 'eyJ'.padEnd(41, 'x')
    const net = fakeFetch(() => json({ id: 9101, imdb_id: 'tt9000303' }))

    const imdb = await fixture.ok(
      over(net.fetch)(
        Effect.flatMap(Effect.service(Tmdb), (tmdb) => tmdb.imdbId(9101)),
      ),
      { ...KEYS, FILMES_TMDB_CHAVE: token },
    )

    expect(imdb).toBe('tt9000303')
    expect(net.calls).toEqual([
      {
        url: 'https://api.themoviedb.org/3/movie/9101/external_ids?',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'filmes',
          Authorization: `Bearer ${token}`,
        },
        at: 0,
      },
    ])
  })
})

describe('TMDB', () => {
  const page = (n: number, total: number) =>
    json({
      page: n,
      total_pages: total,
      results: [{ id: n * 10 }, { id: n * 10 + 1 }],
    })

  test('a failed later page fails the whole search', async () => {
    const fixture = useFixture()
    const net = fakeFetch((url) =>
      url.includes('page=2') ? new Response('', { status: 400 }) : page(1, 2),
    )

    const answer = await fixture.ok(
      over(net.fetch)(
        withWarnings(
          Effect.flatMap(Effect.service(Tmdb), (tmdb) =>
            tmdb.series('Gambito', 2020),
          ),
        ),
      ),
      KEYS,
    )

    expect(answer.value).toBeUndefined()
    expect(answer.warnings).toEqual([
      'TMDB não respondeu (HTTP 400); o que o Wikidata não resolveu fica na fila; `fila reprocessar` consulta o TMDB de novo',
    ])
    expect(net.calls[0]?.url).toContain(
      '/search/tv?query=Gambito&first_air_date_year=2020',
    )
  })

  test('an empty later page adds nothing', async () => {
    const fixture = useFixture()
    const net = fakeFetch((url) =>
      url.includes('page=2') ? json({}) : page(1, 2),
    )

    const films = await fixture.ok(
      over(net.fetch)(
        Effect.flatMap(Effect.service(Tmdb), (tmdb) =>
          tmdb.movies('Eco', 2021),
        ),
      ),
      KEYS,
    )

    expect(films).toEqual([{ id: 10 }, { id: 11 }])
  })
})

describe('TMDB', () => {
  test('the card asks /find in pt-BR, and warns as the card', async () => {
    const fixture = useFixture()
    const net = fakeFetch(() => new Response('', { status: 400 }))

    const answer = await fixture.ok(
      over(net.fetch)(
        withWarnings(
          Effect.flatMap(Effect.service(Tmdb), (tmdb) =>
            tmdb.card('tt9000104'),
          ),
        ),
      ),
      KEYS,
    )

    expect(answer).toEqual({
      value: { poster: null, titlePt: null, overview: null },
      warnings: [
        'TMDB não respondeu (HTTP 400); os filmes saem sem capa, sem título em português e sem sinopse',
      ],
    })
    expect(net.calls.map((call) => call.url)).toEqual([
      'https://api.themoviedb.org/3/find/tt9000104?external_source=imdb_id&language=pt-BR&api_key=tmdb-key',
    ])
  })

  test('a 404 for the details is a film without a runtime', async () => {
    const fixture = useFixture()
    const net = fakeFetch(() => new Response('', { status: 404 }))

    const runtime = await fixture.ok(
      over(net.fetch)(
        Effect.flatMap(Effect.service(Tmdb), (tmdb) => tmdb.runtime(1)),
      ),
      KEYS,
    )

    expect(runtime).toBeUndefined()
    expect(net.calls.map((call) => call.url)).toEqual([
      'https://api.themoviedb.org/3/movie/1?api_key=tmdb-key',
    ])
  })
})
