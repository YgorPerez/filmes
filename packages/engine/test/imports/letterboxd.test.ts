// The Letterboxd ZIP import (ticket #99), the Vitest twin of the ZIP cases
// of tests/test_letterboxd.py. Olga's ZIP comes from
// tests/fixture/letterboxd/olga/ (CSVs in the real export's format);
// Wikidata's P6127 is the fixture's `slugs_letterboxd` and TMDB answers from
// tests/fixture/gravacoes/tmdb/. Where Python rebuilt the database, these
// reload the Letterboxd Fatos (`reloadLetterboxd`, the loading step of a
// rebuild); where Python changed the Catalog's CSV and rebuilt, these change
// the `slugs_letterboxd` row. The queue's commands (`fila`) are #100's: here
// the Dono's decisions are written to imports/letterboxd.md directly.
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  filmKey,
  importLetterboxd,
  letterboxdReport,
  parseYaml,
  personCreate,
  personState,
  personView,
  readResolutions,
  reloadLetterboxd,
  saveResolutions,
  Sqlite,
  TMDB_ATTRIBUTION,
  type EngineServices,
  type Run,
  type Vars,
} from '../../src/index.ts'
import { ROOT, useFixture, type Fixture } from '../fixture.ts'
import { RECORDINGS } from '../sources/support.ts'
import { zipOf } from './zip.ts'

const OLGA = join(ROOT, 'tests/fixture/letterboxd/olga')
const AUTHOR = { name: 'Dono', email: 'dono@example.org' }
const TMDB_ON: Vars = {
  FILMES_TMDB_CHAVE: 'chave-de-teste',
  FILMES_GRAVACOES: RECORDINGS,
}

const olgaZip = () =>
  zipOf(
    readdirSync(OLGA)
      .filter((name) => name.endsWith('.csv'))
      .sort()
      .map((name) => [name, readFileSync(join(OLGA, name))] as const),
  )

const importZip = (
  person: string,
  content: Uint8Array,
  original = 'letterboxd-olga-2026-11-20-utc.zip',
) => importLetterboxd({ person, original, content, author: AUTHOR })

/** The fixture with TMDB on the recordings; `addOlga` creates Olga. */
const useOlga = () => {
  const fixture = useFixture()
  const ok = <A, E>(
    effect: Effect.Effect<A, E, EngineServices | Run>,
    vars: Vars = {},
  ) => fixture.ok(effect, { ...TMDB_ON, ...vars })
  return { fixture, ok }
}

const addOlga = (fixture: Fixture) => fixture.ok(personCreate({ name: 'Olga' }))

const query = (fixture: Fixture, sql: string, ...params: (string | number)[]) =>
  fixture.ok(
    Effect.gen(function* () {
      const rows = yield* (yield* Sqlite).read((db) => db.all(sql, ...params))
      return rows.map((row) => Object.values(row))
    }),
  )

const ratings = (fixture: Fixture, person = 'olga') =>
  query(
    fixture,
    'SELECT filme_id, nota, data, fonte FROM notas WHERE pessoa = ? ORDER BY filme_id, data',
    person,
  )

const report = (fixture: Fixture, person = 'olga') =>
  fixture.ok(
    Effect.gen(function* () {
      return yield* (yield* Sqlite).read((db) => letterboxdReport(db, person))
    }),
  )

/** What `fila confirmar` / `fila descartar` record (#100 ports them). */
const decide = (
  fixture: Fixture,
  name: string,
  year: number,
  fields: [string, string][],
) =>
  fixture.ok(
    Effect.gen(function* () {
      const resolutions = yield* readResolutions
      const id = filmKey(name, year)
      resolutions.set(
        id,
        new Map([
          ['id', id],
          ['name', name],
          ['date', '2026-11-20'],
          ...fields,
        ]),
      )
      yield* saveResolutions(resolutions)
    }),
  )

const resolutionsText = (fixture: Fixture) =>
  readFileSync(join(fixture.data, 'imports/letterboxd.md'), 'utf8')

/** Each film's `status` in imports/letterboxd.md, by name. */
const statuses = (fixture: Fixture) => {
  const text = resolutionsText(fixture)
  const front = parseYaml(text.slice(4, text.indexOf('\n---', 4))) as Map<
    string,
    Map<string, unknown>[]
  >
  return Object.fromEntries(
    (front.get('films') ?? []).map((f) => [f.get('name'), f.get('status')]),
  )
}

const seen = async (fixture: Fixture) =>
  new Set(
    (
      await query(
        fixture,
        "SELECT filme_id FROM ja_visto WHERE pessoa = 'olga'",
      )
    ).map(([id]) => id),
  )

const watchedZip = (rows: [string, number][]) =>
  zipOf([
    [
      'watched.csv',
      'Date,Name,Year,Letterboxd URI\n' +
        rows
          .map(
            ([name, year], i) =>
              `2024-05-0${i + 1},${name},${year},https://boxd.it/s${i + 1}\n`,
          )
          .join(''),
    ],
  ])

describe('importLetterboxd', () => {
  test("Notas resolved by Wikidata become the Pessoa's Notas", async () => {
    const { fixture, ok } = useOlga()
    await addOlga(fixture)
    const result = await ok(importZip('olga', olgaZip()))

    expect(result.person).toBe('olga')
    const notas = await ratings(fixture)
    expect(notas).toContainEqual([
      'tt9000101',
      4.5,
      '2024-01-10',
      'Letterboxd de Olga',
    ]) // slug of the name
    expect(notas).toContainEqual([
      'tt9000102',
      2,
      '2024-02-11',
      'Letterboxd de Olga',
    ]) // slug with -2015
    expect(notas).toContainEqual([
      'tt9000203',
      5,
      '2024-09-18',
      'Letterboxd de Olga',
    ]) // the apostrophe goes
  })

  test('the same ZIP twice, and a reload, keep the Fatos', async () => {
    const { fixture, ok } = useOlga()
    await addOlga(fixture)
    const zip = olgaZip()
    const first = await ok(importZip('olga', zip))
    expect(readFileSync(join(fixture.data, first.file))).toEqual(zip)
    const view = await ok(personView('olga'))
    expect(view.imports).toEqual([
      {
        kind: 'letterboxd',
        file: first.file,
        date: '2026-11-20',
        original: 'letterboxd-olga-2026-11-20-utc.zip',
        sha256: first.file.slice(
          'imports/olga/letterboxd-'.length,
          -'.zip'.length,
        ),
      },
    ])
    const facts = () =>
      query(
        fixture,
        `SELECT fato_id, data, fonte FROM notas WHERE pessoa = 'olga'
         UNION ALL SELECT fato_id, data, fonte FROM declarados WHERE pessoa = 'olga'
         UNION ALL SELECT fato_id, data, fonte FROM ja_visto WHERE pessoa = 'olga'
         UNION ALL SELECT fato_id, data, fonte FROM watchlist WHERE pessoa = 'olga'
         ORDER BY fato_id`,
      )

    const second = await ok(importZip('olga', zip))
    expect(second.newFile).toBe(false)
    expect(Object.values(second.newFacts).every((n) => n === 0)).toBe(true)
    const before = await facts()
    expect(before).toHaveLength(14)
    const cache = join(fixture.root, 'filmes-cache.sqlite')
    rmSync(cache)
    await fixture.ok(reloadLetterboxd, { FILMES_TMDB_CHAVE: undefined })
    expect(await facts()).toEqual(before)
    expect(existsSync(cache)).toBe(false)
  })

  test("the report counts each path; the Dono's decisions resolve and discard", async () => {
    const { fixture, ok } = useOlga()
    await addOlga(fixture)
    const result = await ok(importZip('Olga', olgaZip()))
    expect(result.resolved).toEqual({ wikidata: 5, tmdb: 1, manual: 0 })
    expect(result.discarded).toEqual({ wikidata: 1, tmdb: 1, manual: 0 })
    expect(result.queued).toBe(2)
    expect(result.attributions).toEqual([TMDB_ATTRIBUTION])
    expect(new Set(result.queue.map((i) => i.name))).toEqual(
      new Set(['Filme Perdido', 'Vento Norte']),
    )
    expect(new Set(result.discardedItems.map((i) => i.resolvedBy))).toEqual(
      new Set(['tmdb', 'wikidata']),
    )

    const [vento] = result.queue.filter((i) => i.name === 'Vento Norte')
    const [perdido] = result.queue.filter((i) => i.name === 'Filme Perdido')
    await decide(fixture, 'Vento Norte', vento?.year ?? 0, [
      ['status', 'confirmed'],
      ['film', 'tt9000302'],
    ])
    await decide(fixture, 'Filme Perdido', perdido?.year ?? 0, [
      ['status', 'discarded'],
      ['discard_reason', 'ignorar'],
    ])
    await fixture.ok(reloadLetterboxd)
    const after = await report(fixture)
    expect(after.queue).toEqual([])
    expect(after.resolved.manual).toBe(1)
    expect(after.discardedItems).toContainEqual({
      id: perdido?.id,
      name: 'Filme Perdido',
      year: perdido?.year,
      resolvedBy: 'manual',
      reason: 'ignorar',
    })
    expect(await ratings(fixture)).toContainEqual([
      'tt9000302',
      3.5,
      '2024-07-16',
      'Letterboxd de Olga',
    ])
  })

  test('reviews and tags stay with the Pessoa after a Declarado', async () => {
    const { fixture, ok } = useOlga()
    await addOlga(fixture)
    await ok(importZip('olga', olgaZip()))
    await fixture.ok(personState({ person: 'olga', text: 'Adoro musicais' }))
    const stated = (await fixture.ok(personView('olga'))).stated
    const imported = stated.filter((s) => s.source === 'Letterboxd de Olga')
    expect(new Set(imported.map((s) => s.text))).toEqual(
      new Set([
        'Lindo, triste e lento. Vi duas vezes, "de novo".',
        'Não gostei. Arrastado & frio, sem graça.',
        'tag: cinema',
        'tag: chuva',
      ]),
    )
    expect(new Set(imported.map((s) => s.date))).toEqual(
      new Set(['2024-01-10', '2024-02-11']),
    )
    expect(imported.every((s) => s.specific && s.kind === 'stated')).toBe(true)
    expect(
      await query(
        fixture,
        "SELECT filme_id, data FROM watchlist WHERE pessoa = 'olga'",
      ),
    ).toEqual([['tt9000301', '2024-10-01']])
  })

  test('a Wikidata miniseries with a tconst is discarded too', async () => {
    const { fixture, ok } = useOlga()
    await addOlga(fixture)
    await fixture.ok(
      Effect.flatMap(Sqlite, (sqlite) =>
        sqlite.write((db) =>
          db.run(
            "UPDATE slugs_letterboxd SET imdb = 'tt9023006' WHERE item = 'Q9023006'",
          ),
        ),
      ),
    )
    const result = await ok(importZip('olga', olgaZip()))
    expect(result.discarded.wikidata).toBe(1)
    expect(
      await query(
        fixture,
        "SELECT filme_id FROM ja_visto WHERE filme_id = 'tt9023006'",
      ),
    ).toEqual([])
  })

  test('the queue tells apart names with the same slug', async () => {
    const fixture = useFixture()
    const zip = zipOf([
      [
        'ratings.csv',
        'Date,Name,Year,Letterboxd URI,Rating\n2024-01-09,冬,2020,https://boxd.it/a,4\n2024-01-09,春,2020,https://boxd.it/b,2\n',
      ],
    ])
    const result = await fixture.ok(importZip('iara', zip, 'export.zip'))
    expect(result.queued).toBe(2)
    expect(result.warnings).toHaveLength(1)
    expect(new Set(result.queue.map((i) => i.id)).size).toBe(2)
    await decide(fixture, '冬', 2020, [
      ['status', 'confirmed'],
      ['film', 'tt1112223'],
    ])
    await fixture.ok(reloadLetterboxd)
    expect((await report(fixture, 'iara')).queue.map((i) => i.name)).toEqual([
      '春',
    ])
    expect(await ratings(fixture, 'iara')).toContainEqual([
      'tt1112223',
      4,
      '2024-01-09',
      'Letterboxd de Iara',
    ])
  })

  test("TMDB's answers expire and are asked again", async () => {
    const { fixture, ok } = useOlga()
    await addOlga(fixture)
    await ok(importZip('olga', olgaZip()))
    expect(resolutionsText(fixture)).not.toContain('Nordwind')
    const recordings = join(fixture.root, 'recordings')
    mkdirSync(join(recordings, 'tmdb'), { recursive: true })
    writeFileSync(
      join(recordings, 'tmdb/filme-vento-norte-2020-30b34b9227c5.json'),
      '{"results":[{"id":9102,"title":"Vento Norte","release_date":"2020-02-01"}]}',
    )
    writeFileSync(
      join(recordings, 'tmdb/externos-9102.json'),
      '{"imdb_id":"tt9000302"}',
    )
    const vars = { FILMES_GRAVACOES: recordings }
    // 181 days: the cache still answers.
    expect(
      (
        await ok(importZip('olga', olgaZip()), {
          ...vars,
          FILMES_HOJE: '2027-05-20',
        })
      ).queued,
    ).toBe(2)
    // 182 days: Rio Abaixo (recorded) and Vento Norte (asked again).
    const later = await ok(importZip('olga', olgaZip()), {
      ...vars,
      FILMES_HOJE: '2027-05-21',
    })
    expect(later.resolved.tmdb).toBe(2)
  })

  test('a slug with a TMDB film id resolves even without P345', async () => {
    const { fixture, ok } = useOlga()
    await addOlga(fixture)
    await fixture.ok(
      Effect.flatMap(Sqlite, (sqlite) =>
        sqlite.write((db) =>
          db.run(
            "UPDATE slugs_letterboxd SET imdb = NULL, tmdb = '9101' WHERE imdb = 'tt9000101'",
          ),
        ),
      ),
    )
    await ok(importZip('olga', olgaZip()))
    expect(await ratings(fixture)).toContainEqual([
      'tt9000303',
      4.5,
      '2024-01-10',
      'Letterboxd de Olga',
    ])
  })

  test('an invalid CSV keeps no ZIP', async () => {
    const { fixture, ok } = useOlga()
    await addOlga(fixture)
    const zip = zipOf([
      [
        'export/reviews.csv',
        'Date,Name,Year,Review\n2024-01-09,Filme,2020,"aspas abertas\n',
      ],
    ])
    const outcome = await fixture.run(
      importZip('olga', zip, 'export.zip'),
      TMDB_ON,
    )
    expect(outcome).toEqual({
      exitCode: 1,
      output: {
        error: {
          code: 'invalid_file',
          message: 'export.zip: unexpected end of data',
        },
      },
    })
    expect(existsSync(join(fixture.data, 'imports'))).toBe(false)
    expect((await ok(personView('olga'))).imports).toEqual([])
  })

  test("TMDB's cache still resolves after an item with no answer", async () => {
    const { fixture, ok } = useOlga()
    await addOlga(fixture)
    const header = 'Date,Name,Year,Letterboxd URI\n'
    const rio = '2024-04-13,Rio Abaixo,2014,https://boxd.it/9a4\n'
    expect(
      (
        await ok(
          importZip('olga', zipOf([['watched.csv', header + rio]]), 'rio.zip'),
        )
      ).resolved.tmdb,
    ).toBe(1)
    rmSync(join(fixture.data, 'imports/letterboxd.md'))
    await fixture.ok(reloadLetterboxd)

    const zip = zipOf([
      [
        'watched.csv',
        `${header}2024-01-01,Sem Resposta,2020,https://boxd.it/z\n${rio}`,
      ],
    ])
    const result = await ok(importZip('olga', zip, 'export.zip'), {
      FILMES_TMDB_CHAVE: undefined,
    })
    expect(result.warnings).toHaveLength(1)
    expect(result.queued).toBe(1)
    expect(result.resolved.tmdb).toBe(1)
  })

  test('a series with more votes beats the film of the same name', async () => {
    const { fixture, ok } = useOlga()
    await addOlga(fixture)
    const result = await ok(
      importZip(
        'olga',
        watchedZip([
          ['Dama do Lago', 2017],
          ['Porto Seguro', 2019],
        ]),
      ),
    )
    expect(result.resolved.tmdb).toBe(1)
    expect(statuses(fixture)).toMatchObject({
      'Dama do Lago': 'miniseries',
      'Porto Seguro': 'tmdb',
    })
    const ids = await seen(fixture)
    expect(ids.has('tt9009311')).toBe(true)
    expect(ids.has('tt9009301')).toBe(false)
  })

  test('a short with no votes leaves the candidates when there is a feature', async () => {
    const { fixture, ok } = useOlga()
    await addOlga(fixture)
    const result = await ok(
      importZip(
        'olga',
        watchedZip([
          ['Eco', 2021],
          ['Duas Margens', 2022],
        ]),
      ),
    )
    expect(result.resolved.tmdb).toBe(1)
    expect(statuses(fixture)).toMatchObject({
      Eco: 'tmdb',
      'Duas Margens': 'pending',
    })
    expect((await seen(fixture)).has('tt9009322')).toBe(true)
    expect(result.queue.map((i) => [i.name, i.reason])).toEqual([
      ['Duas Margens', 'o TMDB achou mais de um filme com esse título'],
    ])
  })
})
