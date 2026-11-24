// Candidates and attendee resolution on the fixture database, through the
// engine edge: the parts of `recomendar` (ported later) that read SQLite.

import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  chooseCandidates,
  compareTuple,
  Environment,
  prepareSelection,
  resolveAttendees,
  Sqlite,
} from '../src/index.ts'
import { useFixture } from './fixture.ts'

const selection = Effect.gen(function* () {
  const { weights } = yield* Environment
  const sqlite = yield* Sqlite
  return yield* sqlite.read((db) =>
    Effect.all({
      selection: prepareSelection(db, weights),
      all: db.all('SELECT id, votos, nota_imdb FROM filmes ORDER BY id'),
    }),
  )
})

describe('Candidates', () => {
  test('only films with 1,000 votes and an IMDb rating of 7 or none', async () => {
    const fixture = useFixture()
    const { selection: chosen, all } = await fixture.ok(selection)
    const ids = [...chosen.films.keys()]

    expect(ids).not.toContain('tt9000106') // 600 votes
    expect(ids).not.toContain('tt9000903') // 999 votes
    expect(ids).not.toContain('tt9003401') // Sombra Morna, 6.5 on the IMDb
    expect(ids).toContain('tt9004901') // Mar Aberto, exactly 1,000 votes
    expect(ids).toContain('tt9000104') // As Horas Lentas, 7.4
    expect(ids).toContain('tt9000101') // no IMDb rating: not cut by it
    expect(ids).toEqual(
      all
        .filter(
          (row) =>
            Number(row['votos']) >= 1000 &&
            (row['nota_imdb'] === null || Number(row['nota_imdb']) >= 7),
        )
        .map((row) => row['id']),
    )
  })

  test('a Candidate is the film row, in English', async () => {
    const fixture = useFixture()
    const { selection: chosen } = await fixture.ok(selection)

    expect(chosen.films.get('tt9000104')).toEqual({
      id: 'tt9000104',
      title: 'As Horas Lentas',
      year: 2021,
      runtimeMinutes: 104,
      votes: 28000,
      imdbRating: 7.4,
      imdbDate: null,
      imdbVotesDate: null,
    })
  })

  test('the popular order is most votes first, then by id', async () => {
    const fixture = useFixture()
    const { selection: chosen } = await fixture.ok(selection)
    const votes = (id: string) => chosen.films.get(id)?.votes ?? 0

    expect([...chosen.popular].sort()).toEqual([...chosen.films.keys()].sort())
    expect(
      chosen.popular.every(
        (id, i) =>
          i === 0 ||
          compareTuple(
            [-votes(chosen.popular[i - 1] ?? ''), chosen.popular[i - 1] ?? ''],
            [-votes(id), id],
          ) < 0,
      ),
    ).toBe(true)
  })

  test('the minimums come from the weights', async () => {
    const fixture = useFixture()
    const films = await fixture.ok(
      Effect.gen(function* () {
        const sqlite = yield* Sqlite
        return yield* sqlite.read((db) =>
          chooseCandidates(db, {
            catalog: { min_votes: 999, min_imdb_rating: 6.5 },
          }),
        )
      }),
    )

    expect(films.has('tt9000903')).toBe(true)
    expect(films.has('tt9003401')).toBe(true)
    expect(films.has('tt9000106')).toBe(false)
  })
})

const resolve = (...names: string[]) =>
  Effect.gen(function* () {
    const sqlite = yield* Sqlite
    return yield* sqlite.read((db) => resolveAttendees(db, names))
  })

const change = (sql: string) =>
  Effect.gen(function* () {
    const sqlite = yield* Sqlite
    yield* sqlite.write((db) => db.run(sql))
  })

describe('attendees', () => {
  test('a slug, a name or a nickname, in any ASCII case', async () => {
    const fixture = useFixture()

    expect(await fixture.ok(resolve('bruno'))).toEqual(['bruno'])
    expect(await fixture.ok(resolve('Bruno'))).toEqual(['bruno'])
    expect(await fixture.ok(resolve('EU'))).toEqual(['bruno'])
    expect(await fixture.ok(resolve(' rosa\u001f'))).toEqual(['rosa'])
  })

  test('"dono" is the Pessoa with dono: true, folded as Python', async () => {
    const fixture = useFixture()

    expect(await fixture.ok(resolve('dono', 'DONO', ' Dono '))).toEqual([
      'bruno',
    ])
  })

  test('each Pessoa once, in the order named', async () => {
    const fixture = useFixture()

    expect(
      await fixture.ok(resolve('teo', 'eu', 'Teo', 'dono', 'iara')),
    ).toEqual(['teo', 'bruno', 'iara'])
  })

  test('an unknown name is unknown_person', async () => {
    const fixture = useFixture()

    expect(await fixture.run(resolve('bruno', 'fulano'))).toEqual({
      exitCode: 1,
      output: {
        error: {
          code: 'unknown_person',
          message: "nenhuma Pessoa se chama 'fulano'",
        },
      },
    })
  })

  test('a name two Pessoas answer to is ambiguous_person', async () => {
    const fixture = useFixture()
    await fixture.ok(change("INSERT INTO apelidos VALUES ('rosa', 'Teo')"))

    expect(await fixture.run(resolve('teo'))).toEqual({
      exitCode: 1,
      output: {
        error: {
          code: 'ambiguous_person',
          message: "'teo' pode ser mais de uma Pessoa: rosa, teo",
        },
      },
    })
  })

  test('"dono" with no Dono is unknown_person', async () => {
    const fixture = useFixture()
    await fixture.ok(change('UPDATE pessoas SET dono = 0'))

    expect(await fixture.run(resolve('dono'))).toEqual({
      exitCode: 1,
      output: {
        error: {
          code: 'unknown_person',
          message: 'nenhuma Pessoa tem dono: true no repo de dados',
        },
      },
    })
  })
})
