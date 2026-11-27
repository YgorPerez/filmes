// The IMDb ratings import (#285): the "Your Ratings" CSV, the same format
// `exportRatings` writes. Vera has no Nota in the fixture; her CSV is
// tests/fixture/imdb/vera.csv, three films of the Catálogo and a TV
// episode outside it.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  exportRatings,
  exportSource,
  importImdb,
  personCreate,
  personImports,
  reloadImdb,
  removeImport,
  Sqlite,
} from '../../src/index.ts'
import { ROOT, useFixture, type Fixture } from '../fixture.ts'

const AUTHOR = { name: 'Dono', email: 'dono@example.org' }
const VERA_CSV = readFileSync(join(ROOT, 'tests/fixture/imdb/vera.csv'))

const HEADER =
  'Const,Your Rating,Date Rated,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors'

const importCsv = (
  content: Uint8Array | string,
  person = 'vera',
  original = 'ratings.csv',
) =>
  importImdb({
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

const ratingsOf = (fixture: Fixture, person: string) =>
  query(
    fixture,
    `SELECT filme_id, nota, data FROM notas_vigentes WHERE pessoa = '${person}' ORDER BY filme_id`,
  )

describe('importImdb', () => {
  test('each film of the Catálogo becomes a Nota and a Já visto', async () => {
    const fixture = useFixture()
    const report = await fixture.ok(importCsv(VERA_CSV))

    expect(report.person).toBe('vera')
    expect(report.newFile).toBe(true)
    const sha = createHash('sha256').update(VERA_CSV).digest('hex')
    expect(report.file).toBe(`imports/vera/imdb-${sha}.csv`)
    expect(readFileSync(join(fixture.data, report.file))).toEqual(VERA_CSV)
    expect(report.facts).toEqual({ ratings: 3 })
    expect(report.newFacts).toEqual({ ratings: 3 })
    expect(report.outsideCatalog).toEqual([
      { film: 'tt9028501', title: 'Cais, Episódio 1' },
    ])
    expect(
      await query(
        fixture,
        "SELECT filme_id, nota, data, fonte, tipo FROM notas WHERE pessoa = 'vera' ORDER BY filme_id",
      ),
    ).toEqual([
      ['tt9000202', 4.5, '2025-03-08', 'IMDb de Vera', 'nota'],
      ['tt9000303', 3.5, '2024-11-30', 'IMDb de Vera', 'nota'],
      ['tt9000601', 1, '2025-06-17', 'IMDb de Vera', 'nota'],
    ])
    expect(
      await query(
        fixture,
        "SELECT filme_id FROM ja_vistos WHERE pessoa = 'vera' ORDER BY filme_id",
      ),
    ).toEqual([['tt9000202'], ['tt9000303'], ['tt9000601']])
  })
})

describe('importImdb', () => {
  test('the same file again adds nothing, and the rebuild gives the same Fatos', async () => {
    const fixture = useFixture()
    await fixture.ok(importCsv(VERA_CSV))
    const facts = () =>
      query(
        fixture,
        "SELECT fato_id, filme_id, nota FROM notas WHERE pessoa = 'vera' ORDER BY fato_id",
      )
    const before = await facts()

    const again = await fixture.ok(importCsv(VERA_CSV, 'Vera', 'outro.csv'))
    expect(again.newFile).toBe(false)
    expect(again.newFacts).toEqual({ ratings: 0 })
    expect(await facts()).toEqual(before)

    await fixture.ok(reloadImdb)
    expect(await facts()).toEqual(before)
  })
})

describe('importImdb', () => {
  test('exporting then importing gives back the same Notas', async () => {
    const fixture = useFixture()
    const exported = await fixture.ok(exportRatings('bruno', 'imdb'))
    expect(exported.ratings).toBeGreaterThan(5)
    await fixture.ok(personCreate({ name: 'Olga' }))

    const report = await fixture.ok(importCsv(exported.content, 'olga'))

    expect(report.newFacts).toEqual({ ratings: exported.ratings })
    expect(await ratingsOf(fixture, 'olga')).toEqual(
      await ratingsOf(fixture, 'bruno'),
    )
  })
})

describe('importImdb', () => {
  test('a byte order mark and an older export without every column still read', async () => {
    const fixture = useFixture()
    const report = await fixture.ok(
      importCsv(
        '﻿Const,Your Rating,Date Rated,Title,URL\n' +
          'tt9000202,8,2025-03-08,O Último Bonde,https://www.imdb.com/title/tt9000202/\n',
      ),
    )
    expect(report.newFacts).toEqual({ ratings: 1 })
    expect(await ratingsOf(fixture, 'vera')).toEqual([
      ['tt9000202', 4, '2025-03-08'],
    ])
  })
})

describe('importImdb', () => {
  test.each([
    [
      'without the IMDb columns',
      'Date,Name,Year,Letterboxd URI,Rating\n2025-02-04,Filme,2012,x,2\n',
      'ratings.csv: CSV sem as colunas Const, Your Rating e Date Rated do IMDb',
    ],
    [
      'a rating outside 1 to 10',
      `${HEADER}\ntt9000202,11,2025-03-08\n`,
      'ratings.csv, linha 2: nota fora da escala inteira de 1 a 10',
    ],
    [
      'a Const that is not a tconst',
      `${HEADER}\nfilme,8,2025-03-08\n`,
      'ratings.csv, linha 2: Const não é um ID do IMDb (tt…)',
    ],
    [
      'a date that is not a day',
      `${HEADER}\ntt9000202,8,08/03/2025\n`,
      'ratings.csv, linha 2: data inválida em Date Rated',
    ],
    [
      'a broken quote',
      `${HEADER}\ntt9000202,8,"2025-03-08"x\n`,
      'ratings.csv: CSV inválido',
    ],
  ])('%s is invalid_file, and nothing is kept', async (_, csv, message) => {
    const fixture = useFixture()
    expect((await fixture.run(importCsv(csv))).output).toEqual({
      error: { code: 'invalid_file', message },
    })
    expect(existsSync(join(fixture.data, 'imports/vera'))).toBe(false)
  })

  test('bytes that are not UTF-8 are invalid_file', async () => {
    const fixture = useFixture()
    expect(
      (await fixture.run(importCsv(new Uint8Array([0xff, 0xfe, 0x00])))).output,
    ).toEqual({
      error: {
        code: 'invalid_file',
        message: 'ratings.csv: o CSV do IMDb não está em UTF-8',
      },
    })
  })
})

describe('personImports', () => {
  test('counts the IMDb Notas, and removing the import takes them', async () => {
    const fixture = useFixture()
    const { file } = await fixture.ok(importCsv(VERA_CSV))
    const report = await fixture.ok(personImports('vera'))
    expect(report.imports).toEqual([
      { kind: 'imdb', file, date: '2026-11-20', original: 'ratings.csv' },
    ])
    expect(report.imdb).toEqual({ ratings: 3 })

    const removed = await fixture.ok(removeImport({ file, author: AUTHOR }))
    expect(removed.removedFacts).toEqual({
      ratings: 3,
      seen: 0,
      stated: 0,
      watchlist: 0,
    })
    expect(await ratingsOf(fixture, 'vera')).toEqual([])
    expect(existsSync(join(fixture.data, file))).toBe(false)
  })
})

describe('exportSource', () => {
  test('an IMDb ratings CSV is imdb; another CSV is neither', () => {
    expect(exportSource(VERA_CSV)).toBe('imdb')
    expect(
      exportSource(new TextEncoder().encode('Date,Name,Year\n')),
    ).toBeNull()
  })
})
