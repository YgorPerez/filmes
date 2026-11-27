// The Simkl backup import (#299): the `SimklBackup.json` Simkl's export
// gives, alone or in its ZIP. Vera has no Nota in the fixture; her backup
// is tests/fixture/simkl/SimklBackup.json (see the fixture's LEIAME).
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  exportSource,
  importSimkl,
  personImports,
  reloadSimkl,
  removeImport,
  Sqlite,
  TMDB_ATTRIBUTION,
  type Vars,
} from '../../src/index.ts'
import { ROOT, useFixture, type Fixture } from '../fixture.ts'
import { RECORDINGS } from '../sources/support.ts'
import { zipOf } from './zip.ts'

const AUTHOR = { name: 'Dono', email: 'dono@example.org' }
const BACKUP = readFileSync(join(ROOT, 'tests/fixture/simkl/SimklBackup.json'))
const TMDB_ON: Vars = {
  FILMES_TMDB_CHAVE: 'chave-de-teste',
  FILMES_GRAVACOES: RECORDINGS,
}
const TMDB_OFF: Vars = { FILMES_TMDB_CHAVE: undefined }

const importBackup = (
  content: Uint8Array | string,
  original = 'SimklBackup.json',
  person = 'vera',
) =>
  importSimkl({
    person,
    original,
    content:
      typeof content === 'string' ? new TextEncoder().encode(content) : content,
    author: AUTHOR,
  })

const query = (fixture: Fixture, sql: string) =>
  fixture.ok(
    Effect.gen(function* () {
      const rows = yield* (yield* Sqlite).read((db) => db.all(sql))
      return rows.map((row) => Object.values(row))
    }),
  )

/** Vera's Simkl Fatos, table by table. */
const factsOf = async (fixture: Fixture) => ({
  ratings: await query(
    fixture,
    "SELECT filme_id, nota, data, fonte FROM notas WHERE pessoa = 'vera' ORDER BY filme_id",
  ),
  seen: await query(
    fixture,
    "SELECT filme_id, tipo, data, fonte FROM ja_visto WHERE pessoa = 'vera' ORDER BY filme_id",
  ),
  watchlist: await query(
    fixture,
    "SELECT filme_id, data, fonte FROM watchlist WHERE pessoa = 'vera' ORDER BY filme_id",
  ),
})

/** What the fixture backup gives once Rio Abaixo is resolved by TMDB. */
const WITH_RIO_ABAIXO = {
  ratings: [
    ['tt9000102', 3, '2024-07-14', 'Simkl de Vera'],
    ['tt9000202', 4.5, '2025-03-08', 'Simkl de Vera'],
    ['tt9000701', 4, '2022-12-24', 'Simkl de Vera'],
  ],
  seen: [
    ['tt9000303', 'declarado', '2023-05-01', 'Simkl de Vera'],
    ['tt9000602', 'declarado', '2026-11-20', 'Simkl de Vera'],
  ],
  watchlist: [['tt9000601', '2026-10-02', 'Simkl de Vera']],
}

describe('importSimkl', () => {
  test('films and anime films become Notas, Já vistos and the watchlist; shows do not', async () => {
    const fixture = useFixture()
    const report = await fixture.ok(importBackup(BACKUP), TMDB_OFF)

    expect(report.person).toBe('vera')
    expect(report.newFile).toBe(true)
    const sha = createHash('sha256').update(BACKUP).digest('hex')
    expect(report.file).toBe(`imports/vera/simkl-${sha}.json`)
    expect(readFileSync(join(fixture.data, report.file))).toEqual(BACKUP)
    expect(report.resolved).toEqual({ imdb: 4, tmdb: 1 })
    expect(report.unresolved).toEqual([
      {
        name: 'Rio Abaixo',
        year: 2014,
        imdb: null,
        tmdb: '9101',
        simkl: 9100003,
      },
      {
        name: 'Filme Perdido',
        year: 1999,
        imdb: 'tt9999901',
        tmdb: null,
        simkl: 9100007,
      },
      {
        name: 'Filme Sem Ids',
        year: 2020,
        imdb: null,
        tmdb: null,
        simkl: 9100011,
      },
    ])
    expect(report.newFacts).toEqual({ ratings: 3, seen: 1, watchlist: 1 })
    expect(await factsOf(fixture)).toEqual({
      ...WITH_RIO_ABAIXO,
      seen: [['tt9000602', 'declarado', '2026-11-20', 'Simkl de Vera']],
    })
  })
})

describe('importSimkl', () => {
  test('TMDB gives the tconst the ids leave out, the record keeps it, and the rebuild reads it offline', async () => {
    const fixture = useFixture()
    const report = await fixture.ok(importBackup(BACKUP), TMDB_ON)

    expect(report.resolved).toEqual({ imdb: 4, tmdb: 2 })
    expect(report.unresolved.map((film) => film.name)).toEqual([
      'Filme Perdido',
      'Filme Sem Ids',
    ])
    expect(report.attributions).toEqual([TMDB_ATTRIBUTION])
    expect(await factsOf(fixture)).toEqual(WITH_RIO_ABAIXO)
    expect(
      readFileSync(join(fixture.data, 'people/vera.md'), 'utf8'),
    ).toContain("tmdb: {'9101': tt9000303}")

    await fixture.ok(reloadSimkl, TMDB_OFF)
    expect(await factsOf(fixture)).toEqual(WITH_RIO_ABAIXO)
  })
})

describe('importSimkl', () => {
  test("Simkl's ZIP gives what the bare JSON gives, and the same file again adds nothing", async () => {
    const fixture = useFixture()
    const zip = zipOf([['SimklBackup.json', BACKUP]])
    const report = await fixture.ok(
      importBackup(zip, 'SimklBackup.zip'),
      TMDB_ON,
    )
    const sha = createHash('sha256').update(zip).digest('hex')
    expect(report.file).toBe(`imports/vera/simkl-${sha}.zip`)
    expect(await factsOf(fixture)).toEqual(WITH_RIO_ABAIXO)

    const again = await fixture.ok(
      importBackup(zip, 'outro.zip', 'Vera'),
      TMDB_OFF,
    )
    expect(again.newFile).toBe(false)
    expect(again.newFacts).toEqual({ ratings: 0, seen: 0, watchlist: 0 })
    expect(await factsOf(fixture)).toEqual(WITH_RIO_ABAIXO)
  })
})

describe('importSimkl', () => {
  test("a TMDB id resolves through Wikidata's P4947", async () => {
    const fixture = useFixture()
    await fixture.ok(
      Effect.flatMap(Sqlite, (s) =>
        s.write((db) =>
          Effect.gen(function* () {
            for (const [property, value] of [
              ['P4947', '9101'],
              ['P345', 'tt9000303'],
            ])
              yield* db.run(
                `INSERT INTO metadados_wikidata (item, propriedade, valor, fonte, data)
                 VALUES ('Q9029901', ?, ?, 'Wikidata', '2026-11-01')`,
                property,
                value,
              )
          }),
        ),
      ),
    )
    const report = await fixture.ok(importBackup(BACKUP), TMDB_OFF)
    expect(report.resolved).toEqual({ imdb: 4, tmdb: 2 })
    expect(report.attributions).toEqual([])
    expect(await factsOf(fixture)).toEqual(WITH_RIO_ABAIXO)
  })
})

const backupWith = (movie: object) =>
  JSON.stringify({ movies: [movie], shows: [], anime: [] })

const GODFATHER_IDS = { title: 'O Último Bonde', ids: { imdb: 'tt9000202' } }

describe('importSimkl', () => {
  test.each([
    ['not JSON', '{', 'SimklBackup.json: JSON do Simkl inválido'],
    [
      'JSON without the films',
      '{"user": {}}',
      'SimklBackup.json: JSON sem movies nem anime de um backup do Simkl',
    ],
    [
      'a rating outside 1 to 10',
      backupWith({
        user_rating: 11,
        status: 'completed',
        movie: GODFATHER_IDS,
      }),
      'SimklBackup.json, movies, item 1: nota fora da escala inteira de 1 a 10',
    ],
    [
      'a date that does not read',
      backupWith({
        user_rating: 8,
        last_watched_at: '08/03/2025',
        movie: GODFATHER_IDS,
      }),
      'SimklBackup.json, movies, item 1: data inválida em last_watched_at',
    ],
    [
      'a film that is not an object',
      JSON.stringify({ movies: [3] }),
      'SimklBackup.json, movies, item 1: era esperado um objeto',
    ],
  ])('%s is invalid_file, and nothing is kept', async (_, json, message) => {
    const fixture = useFixture()
    expect((await fixture.run(importBackup(json))).output).toEqual({
      error: { code: 'invalid_file', message },
    })
    expect(existsSync(join(fixture.data, 'imports/vera'))).toBe(false)
  })

  test('a ZIP without the backup is invalid_file', async () => {
    const fixture = useFixture()
    expect(
      (
        await fixture.run(
          importBackup(zipOf([['outro.json', '{}']]), 'SimklBackup.zip'),
        )
      ).output,
    ).toEqual({
      error: {
        code: 'invalid_file',
        message: 'SimklBackup.zip: ZIP sem o SimklBackup.json do Simkl',
      },
    })
  })
})

describe('personImports', () => {
  test('counts the Simkl Fatos, and removing the import takes them', async () => {
    const fixture = useFixture()
    const { file } = await fixture.ok(importBackup(BACKUP), TMDB_OFF)
    const report = await fixture.ok(personImports('vera'))
    expect(report.imports).toEqual([
      { kind: 'simkl', file, date: '2026-11-20', original: 'SimklBackup.json' },
    ])
    expect(report.simkl).toEqual({ ratings: 3, seen: 1, watchlist: 1 })

    const removed = await fixture.ok(removeImport({ file, author: AUTHOR }))
    expect(removed.removedFacts).toEqual({
      ratings: 3,
      seen: 1,
      stated: 0,
      watchlist: 1,
    })
    expect(await factsOf(fixture)).toEqual({
      ratings: [],
      seen: [],
      watchlist: [],
    })
    expect(existsSync(join(fixture.data, file))).toBe(false)
  })
})

describe('exportSource', () => {
  test("Simkl's backup is simkl, bare or in its ZIP; other JSON is neither", () => {
    expect(exportSource(BACKUP)).toBe('simkl')
    expect(exportSource(zipOf([['SimklBackup.json', BACKUP]]))).toBe('simkl')
    expect(exportSource(new TextEncoder().encode('{"user": {}}'))).toBeNull()
    expect(exportSource(new TextEncoder().encode('[]'))).toBeNull()
  })
})
