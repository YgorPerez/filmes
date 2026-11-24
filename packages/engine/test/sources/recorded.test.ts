// The on-demand sources over the recordings (`FILMES_GRAVACOES`), as the
// Python tests and the oracle run them: hits, misses, the cache and its
// expiry, a missing key, and recorded failures with and without `vezes`.

import { existsSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  DoesTheDogDie,
  findTopic,
  makeEngine,
  Omdb,
  Run,
  Tmdb,
} from '../../src/index.ts'
import { useFixture } from '../fixture.ts'
import {
  cacheRows,
  OFFLINE,
  RECORDED,
  recordFailure,
  recording,
  recordingsCopy,
  withWarnings,
} from './support.ts'

const OMDB_WITHOUT_KEY =
  'OMDb sem chave de API (defina FILMES_OMDB_CHAVE); filmes sem classificação local saem da Sessão com criança'
const TMDB_OUT = (reason: string) =>
  `TMDB não respondeu (${reason}); o que o Wikidata não resolveu fica na fila; \`fila reprocessar\` consulta o TMDB de novo`

const ageRating = (imdbId: string) =>
  Effect.flatMap(Effect.service(Omdb), (omdb) => omdb.ageRating(imdbId))

describe('OMDb', () => {
  test('gives the recorded Rated, dated the day it was fetched', async () => {
    const fixture = useFixture()

    const answer = await fixture.ok(
      withWarnings(ageRating('tt9000302')),
      RECORDED,
    )

    expect(answer).toEqual({
      value: { rated: 'PG', date: '2026-11-20', factId: 'omdb:tt9000302' },
      warnings: [],
    })
  })

  test('a film without a recording is not found, and that is cached too', async () => {
    const fixture = useFixture()

    const first = await fixture.ok(
      withWarnings(ageRating('tt9000303')),
      RECORDED,
    )
    // Neither key nor recordings: only the cache can answer, without a
    // warning.
    const again = await fixture.ok(
      withWarnings(ageRating('tt9000303')),
      OFFLINE,
    )

    expect(first).toEqual({ value: undefined, warnings: [] })
    expect(again).toEqual({ value: undefined, warnings: [] })
    expect(cacheRows(join(fixture.root, 'filmes-cache.sqlite'))).toEqual([
      {
        fonte: 'omdb',
        chave: 'tt9000303',
        corpo: { Response: 'False', Error: 'Movie not found!' },
        obtido_em: '2026-11-20',
        expira_em: '2026-12-20',
      },
    ])
  })

  test('"Not Rated" is a value; N/A and a blank one are not', async () => {
    const fixture = useFixture()
    const dir = recordingsCopy(fixture)
    writeFileSync(
      join(dir, 'omdb', 'tt8000001.json'),
      JSON.stringify({ Response: 'True', Rated: 'N/A' }),
    )
    writeFileSync(
      join(dir, 'omdb', 'tt8000002.json'),
      JSON.stringify({ Response: 'True', Rated: ' \u001c' }),
    )

    const ratings = await fixture.ok(
      Effect.all([
        ageRating('tt9000402'),
        ageRating('tt8000001'),
        ageRating('tt8000002'),
      ]),
      { ...RECORDED, FILMES_GRAVACOES: dir },
    )

    expect(ratings).toEqual([
      { rated: 'Not Rated', date: '2026-11-20', factId: 'omdb:tt9000402' },
      undefined,
      undefined,
    ])
  })

  test('without its key it warns once and asks nothing', async () => {
    const fixture = useFixture()

    const answer = await fixture.ok(
      withWarnings(
        Effect.all([ageRating('tt9000302'), ageRating('tt9000203')]),
      ),
      { ...RECORDED, FILMES_OMDB_CHAVE: undefined },
    )

    expect(answer).toEqual({
      value: [undefined, undefined],
      warnings: [OMDB_WITHOUT_KEY],
    })
    expect(cacheRows(join(fixture.root, 'filmes-cache.sqlite'))).toEqual([])
  })

  test('the cached answer lasts 30 days', async () => {
    const fixture = useFixture()
    await fixture.ok(ageRating('tt9000302'), RECORDED)

    const lastDay = await fixture.ok(withWarnings(ageRating('tt9000302')), {
      ...OFFLINE,
      FILMES_HOJE: '2026-12-19',
    })
    const expired = await fixture.ok(withWarnings(ageRating('tt9000302')), {
      ...OFFLINE,
      FILMES_HOJE: '2026-12-20',
    })

    expect(lastDay).toEqual({
      value: { rated: 'PG', date: '2026-11-20', factId: 'omdb:tt9000302' },
      warnings: [],
    })
    expect(expired).toEqual({ value: undefined, warnings: [OMDB_WITHOUT_KEY] })
  })

  test('the cache is FILMES_CACHE when set, created with its folder', async () => {
    const fixture = useFixture()
    const cache = join(fixture.root, 'elsewhere', 'answers.sqlite')

    await fixture.ok(ageRating('tt9000302'), {
      ...RECORDED,
      FILMES_CACHE: cache,
    })

    expect(cacheRows(cache)).toHaveLength(1)
    expect(existsSync(join(fixture.root, 'filmes-cache.sqlite'))).toBe(false)
  })
})

describe('Does the Dog Die', () => {
  test('gives the votes per topic, by name, question or id', async () => {
    const fixture = useFixture()

    const topics = await fixture.ok(
      Effect.flatMap(Effect.service(DoesTheDogDie), (ddd) =>
        ddd.topics('tt9000105'),
      ),
      RECORDED,
    )

    const dogDies = { name: 'a dog dies', yes: 1, no: 14 }
    expect(topics && findTopic(topics, 'a dog dies')).toEqual(dogDies)
    expect(topics && findTopic(topics, '  Does the dog DIE ')).toEqual(dogDies)
    expect(topics && findTopic(topics, '153')).toEqual(dogDies)
    expect(topics && findTopic(topics, 'there are jump scares')).toEqual({
      name: 'there are jump scares',
      yes: 8,
      no: 1,
    })
    expect(topics && findTopic(topics, 'a cat dies')).toBeUndefined()
    expect(topics?.date).toBe('2026-11-20')
    expect(topics?.factId).toBe('ddd:tt9000105')
  })

  test('a film without topics has none', async () => {
    const fixture = useFixture()

    const topics = await fixture.ok(
      Effect.flatMap(Effect.service(DoesTheDogDie), (ddd) =>
        ddd.topics('tt9000106'),
      ),
      RECORDED,
    )

    expect(topics).toBeUndefined()
  })
})

const tmdb = Effect.service(Tmdb)

describe('TMDB', () => {
  test('searches films and series by title and year', async () => {
    const fixture = useFixture()

    const found = await fixture.ok(
      Effect.gen(function* () {
        const source = yield* tmdb
        return {
          films: yield* source.movies('Rio Abaixo', 2015),
          sameSlug: yield* source.movies('Rio Abaixo', 2014),
          series: yield* source.series('Gambito', 2020),
          none: yield* source.movies('Nenhum Filme', 2001),
        }
      }),
      RECORDED,
    )

    expect(found).toEqual({
      films: (
        recording('tmdb', 'filme-rio-abaixo-2015-cb01025b85e0') as {
          results: unknown[]
        }
      ).results,
      sameSlug: (
        recording('tmdb', 'filme-rio-abaixo-2014-cb01025b85e0') as {
          results: unknown[]
        }
      ).results,
      series: (
        recording('tmdb', 'serie-gambito-2020-cd32cf011871') as {
          results: unknown[]
        }
      ).results,
      none: [],
    })
  })

  test('gives the tconst and the runtime of a TMDB id', async () => {
    const fixture = useFixture()

    const found = await fixture.ok(
      Effect.gen(function* () {
        const source = yield* tmdb
        return {
          imdb: yield* source.imdbId(9101),
          imdbOfText: yield* source.imdbId('9101'),
          notAnId: yield* source.imdbId('abc'),
          unknown: yield* source.imdbId(9999),
          runtime: yield* source.runtime(9321),
          noRuntime: yield* source.runtime(9999),
          runtimeNotAnId: yield* source.runtime('9.5'),
        }
      }),
      RECORDED,
    )

    expect(found).toEqual({
      imdb: 'tt9000303',
      imdbOfText: 'tt9000303',
      notAnId: undefined,
      unknown: undefined,
      runtime: 6,
      noRuntime: undefined,
      runtimeNotAnId: undefined,
    })
  })

  test('the card has the pt-BR poster, title and overview, or nulls', async () => {
    const fixture = useFixture()

    const cards = await fixture.ok(
      Effect.gen(function* () {
        const source = yield* tmdb
        return [
          yield* source.card('tt9000104'),
          yield* source.card('tt9000999'),
          yield* source.card('9000104'),
        ]
      }),
      RECORDED,
    )

    const none = { poster: null, titlePt: null, overview: null }
    expect(cards).toEqual([
      {
        poster: 'https://image.tmdb.org/t/p/w185/hOrAsLeNtAs9104.jpg',
        titlePt: 'As Horas Lentas',
        overview:
          'Numa cidade do interior, uma relojoeira percebe que os relógios da casa atrasam um minuto por noite. Ela decide descobrir por quê, e o que acha muda a família inteira.',
      },
      none,
      none,
    ])
  })

  test('the cached search is read without creating the cache', async () => {
    const fixture = useFixture()
    const cache = join(fixture.root, 'filmes-cache.sqlite')
    const cached = Effect.flatMap(tmdb, (source) =>
      source.cachedMovies('Rio Abaixo', 2015),
    )

    const before = await fixture.ok(cached, RECORDED)
    const created = existsSync(cache)
    await fixture.ok(
      Effect.flatMap(tmdb, (source) => source.movies('Rio Abaixo', 2015)),
      RECORDED,
    )
    const after = await fixture.ok(cached, OFFLINE)
    const otherYear = await fixture.ok(
      Effect.flatMap(tmdb, (source) => source.cachedMovies('Rio Abaixo', 2014)),
      OFFLINE,
    )

    expect(before).toBeUndefined()
    expect(created).toBe(false)
    expect(after).toEqual([
      expect.objectContaining({ id: 9101, title: 'Rio Abaixo' }),
    ])
    expect(otherYear).toBeUndefined()
  })
})

describe('recorded failures', () => {
  const RIO = 'filme-rio-abaixo-2015-cb01025b85e0'
  const search = Effect.flatMap(tmdb, (source) =>
    source.movies('Rio Abaixo', 2015),
  )

  test('fewer failures than tries are tried again, with no warning', async () => {
    const fixture = useFixture()
    const dir = recordingsCopy(fixture)
    recordFailure(dir, 'tmdb', RIO, {
      motivo: 'Connection reset by peer',
      vezes: 2,
    })

    const answer = await fixture.ok(withWarnings(search), {
      ...RECORDED,
      FILMES_GRAVACOES: dir,
    })

    expect(answer.value).toEqual([
      expect.objectContaining({ id: 9101, title: 'Rio Abaixo' }),
    ])
    expect(answer.warnings).toEqual([])
  })

  test.each([
    ['three times', { motivo: 'Connection reset by peer', vezes: 3 }],
    ['always', { motivo: 'Connection reset by peer' }],
  ])(
    'a failure %s switches the source off for the request, uncached',
    async (_, failure) => {
      const fixture = useFixture()
      const dir = recordingsCopy(fixture)
      recordFailure(dir, 'tmdb', RIO, failure)
      const vars = { ...RECORDED, FILMES_GRAVACOES: dir }
      await fixture.ok(
        Effect.flatMap(tmdb, (source) => source.movies('Eco', 2021)),
        vars,
      )

      const answer = await fixture.ok(
        withWarnings(
          Effect.gen(function* () {
            const source = yield* tmdb
            return {
              off: yield* source.searchDisabled,
              failed: yield* search,
              offAfter: yield* source.searchDisabled,
              // Off: what has a recording is not asked...
              other: yield* source.movies('Porto Seguro', 2019),
              // ...but the cache still answers...
              cached: (yield* source.movies('Eco', 2021))?.length,
              // ...and the card is another profile, still on.
              card: (yield* source.card('tt9000104')).titlePt,
            }
          }),
        ),
        vars,
      )

      expect(answer).toEqual({
        value: {
          off: false,
          failed: undefined,
          offAfter: true,
          other: undefined,
          cached: 2,
          card: 'As Horas Lentas',
        },
        warnings: [TMDB_OUT('Connection reset by peer')],
      })
      const keys = cacheRows(join(fixture.root, 'filmes-cache.sqlite')).map(
        (row) => row['chave'],
      )
      expect(keys).toEqual([
        'filme-eco-2021-330a4e5fcb85',
        'find-tt9000104-pt-BR',
      ])
    },
  )

  test('the next request on the engine starts with the source on and the count at zero', async () => {
    const fixture = useFixture()
    const dir = recordingsCopy(fixture)
    recordFailure(dir, 'tmdb', RIO, { motivo: 'timed out', vezes: 3 })
    const engine = makeEngine({
      ...fixture.vars,
      ...RECORDED,
      FILMES_GRAVACOES: dir,
    })

    try {
      const first = await engine.run(withWarnings(search))
      const second = await engine.run(withWarnings(search))

      const expected = {
        exitCode: 0,
        output: { value: undefined, warnings: [TMDB_OUT('timed out')] },
      }
      expect(first).toEqual(expected)
      expect(second).toEqual(expected)
    } finally {
      await engine.dispose()
    }
  })

  test('the failure count is per key and per profile', async () => {
    const fixture = useFixture()
    const dir = recordingsCopy(fixture)
    recordFailure(dir, 'tmdb', 'find-tt9000104-pt-BR', {
      motivo: 'x',
      vezes: 2,
    })
    recordFailure(dir, 'tmdb', 'externos-9101', { motivo: 'x', vezes: 2 })

    const answer = await fixture.ok(
      withWarnings(
        Effect.gen(function* () {
          const source = yield* tmdb
          return [
            (yield* source.card('tt9000104')).titlePt,
            yield* source.imdbId(9101),
          ]
        }),
      ),
      { ...RECORDED, FILMES_GRAVACOES: dir },
    )

    expect(answer).toEqual({
      value: ['As Horas Lentas', 'tt9000303'],
      warnings: [],
    })
  })

  test('a broken failure recording is an internal error', async () => {
    const fixture = useFixture()
    const dir = recordingsCopy(fixture)
    writeFileSync(join(dir, 'tmdb', `${RIO}.falha.json`), '{"vezes": "duas"}')

    const outcome = await fixture.run(search, {
      ...RECORDED,
      FILMES_GRAVACOES: dir,
    })

    expect(outcome.exitCode).toBe(1)
    expect(outcome.output).toMatchObject({ error: { code: 'internal' } })
  })
})

test('the run keeps the warnings in the order the sources gave them', async () => {
  const fixture = useFixture()
  rmSync(join(fixture.root, 'filmes-cache.sqlite'), { force: true })

  const warnings = await fixture.ok(
    Effect.gen(function* () {
      yield* ageRating('tt9000302')
      yield* Effect.flatMap(Effect.service(DoesTheDogDie), (ddd) =>
        ddd.topics('tt9000105'),
      )
      return yield* (yield* Run).warnings
    }),
    { ...OFFLINE, FILMES_GRAVACOES: undefined },
  )

  expect(warnings).toEqual([
    OMDB_WITHOUT_KEY,
    'Does the Dog Die sem chave de API (defina FILMES_DDD_CHAVE); o gatilho fica sem informação e nenhum filme sai por ele',
  ])
})
