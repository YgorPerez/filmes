// The TV Time import (#300): the backups former users kept after TV Time
// shut down. The GDPR export has no film ids, so its films go through the
// Letterboxd resolution chain and queue; the Liberator export names the
// tconst. The fixture's backups are in tests/fixture/tvtime (LEIAME.md says
// what each film is for); Vera has no Nota in the fixture.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  confirmQueueItem,
  exportSource,
  importLetterboxd,
  importTvTime,
  personCreate,
  personImports,
  reloadData,
  removeImport,
  Sqlite,
  TMDB_ATTRIBUTION,
  viewQueue,
  Zip,
  type Vars,
} from '../../src/index.ts'
import { engineRecommendation, film } from '../recommendation/support.ts'
import { ROOT, useFixture, type Fixture } from '../fixture.ts'
import { RECORDINGS } from '../sources/support.ts'
import { zipOf } from './zip.ts'

const AUTHOR = { name: 'Dono', email: 'dono@example.org' }
const TVTIME = join(ROOT, 'tests/fixture/tvtime')
const TMDB_ON: Vars = {
  FILMES_GRAVACOES: RECORDINGS,
  FILMES_TMDB_CHAVE: 'chave-de-teste',
}

/** A folder of the fixture as the ZIP the service gave, inside `folder`. */
const zipFolder = (name: string, folder: string) =>
  zipOf(
    readdirSync(join(TVTIME, name))
      .sort()
      .map(
        (file) =>
          [`${folder}${file}`, readFileSync(join(TVTIME, name, file))] as const,
      ),
  )

const GDPR_ZIP = zipFolder('gdpr-data', 'gdpr-data/')
const LIBERATOR_ZIP = zipFolder('liberator', '')

const importZip = (
  fixture: Fixture,
  content: Uint8Array,
  person = 'vera',
  original = 'gdpr-data.zip',
) =>
  fixture.ok(
    importTvTime({ person, original, content, author: AUTHOR }),
    TMDB_ON,
  )

const query = (fixture: Fixture, sql: string) =>
  fixture.ok(
    Effect.gen(function* () {
      const rows = yield* (yield* Sqlite).read((db) => db.all(sql))
      return rows.map((row) => Object.values(row))
    }),
  )

const veraFacts = (fixture: Fixture) =>
  Promise.all([
    query(
      fixture,
      "SELECT filme_id, nota, data, fonte FROM notas WHERE pessoa = 'vera' ORDER BY filme_id, data",
    ),
    query(
      fixture,
      "SELECT filme_id, data, fonte FROM ja_visto WHERE pessoa = 'vera' ORDER BY filme_id, data",
    ),
    query(
      fixture,
      "SELECT filme_id, data, fonte FROM watchlist WHERE pessoa = 'vera' ORDER BY filme_id",
    ),
  ])

/** The names inside a ZIP and the text of all its members. */
const unzipped = (content: Uint8Array) => {
  const zip = new Zip(Buffer.from(content))
  return {
    names: zip.names(),
    text: zip
      .members()
      .map((m) => m.read().toString('utf8'))
      .join('\n'),
  }
}

describe('importTvTime, the GDPR export', () => {
  test('films resolve by the English slug and the year, or wait in the queue', async () => {
    const fixture = useFixture()
    const report = await importZip(fixture, GDPR_ZIP)

    expect(report.person).toBe('vera')
    expect(report.newFile).toBe(true)
    expect(report.resolved).toEqual({ wikidata: 3, tmdb: 1, manual: 0 })
    expect(report.queue.map((i) => [i.name, i.year, i.reason])).toEqual([
      ['Filme Perdido', null, 'o export não traz o ano do filme'],
      ['Vento Norte', 2020, 'o TMDB achou mais de um filme com esse título'],
    ])
    expect(report.attributions).toEqual([TMDB_ATTRIBUTION])
    expect(report.outsideCatalog).toEqual([])

    const [ratings, seen, watchlist] = await veraFacts(fixture)
    expect(ratings).toEqual([
      // Great, on the rewatch: the latest watch.
      ['tt9000101', 4, '2025-01-10', 'TV Time de Vera'],
      // Localized as ガラスの街; bad, the day it was logged.
      ['tt9000103', 1, '2022-08-15', 'TV Time de Vera'],
      // Good; through TMDB's search.
      ['tt9009311', 3, '2021-07-04', 'TV Time de Vera'],
    ])
    expect(seen).toEqual([
      ['tt9000101', '2023-05-01', 'TV Time de Vera'],
      ['tt9000101', '2025-01-10', 'TV Time de Vera'],
      ['tt9000103', '2022-08-15', 'TV Time de Vera'],
      ['tt9009311', '2021-07-04', 'TV Time de Vera'],
    ])
    expect(watchlist).toEqual([['tt9000301', '2024-09-01', 'TV Time de Vera']])
    expect(report.newFacts).toEqual({
      ratings: 3,
      seen: 4,
      stated: 0,
      watchlist: 1,
    })
  })

  test('keeps only the film files: credentials, emotions and episodes stay out', async () => {
    const fixture = useFixture()
    const report = await importZip(fixture, GDPR_ZIP)

    const kept = unzipped(readFileSync(join(fixture.data, report.file)))
    expect(report.file).toMatch(/^imports\/vera\/tvtime-[0-9a-f]{64}\.zip$/)
    expect(kept.names).toEqual([
      'gdpr-data/ratings-live-votes.csv',
      'gdpr-data/tracking-prod-records.csv',
    ])
    for (const decoy of [
      'TOKEN-NAO-LER',
      'SENHA-NAO-LER',
      'vera@example.org',
      'EMOCAO-NAO-LER',
      'SERIE-NAO-LER',
      'user_id',
      '4242',
    ])
      expect(kept.text).not.toContain(decoy)
    // Only the film rows and the columns the reader takes.
    expect(kept.text).toContain(
      'uuid,type,entity_type,alpha_range_key,release_date,created_at,watch_date_range_key,movie_name\r\n',
    )
  })

  test('the same backup again adds nothing, and the reload gives the same Fatos', async () => {
    const fixture = useFixture()
    await importZip(fixture, GDPR_ZIP)
    const before = await veraFacts(fixture)

    const again = await importZip(fixture, GDPR_ZIP, 'Vera', 'outro.zip')
    expect(again.newFile).toBe(false)
    expect(again.newFacts).toEqual({
      ratings: 0,
      seen: 0,
      stated: 0,
      watchlist: 0,
    })
    expect(await veraFacts(fixture)).toEqual(before)

    await fixture.ok(reloadData)
    expect(await veraFacts(fixture)).toEqual(before)
  })

  test("the Dono's decision is the one the Letterboxd queue shares", async () => {
    const fixture = useFixture()
    await fixture.ok(personCreate({ name: 'Olga' }))
    await fixture.ok(
      importLetterboxd({
        person: 'olga',
        original: 'letterboxd.zip',
        content: zipOf([
          [
            'watched.csv',
            'Date,Name,Year,Letterboxd URI\n2024-07-16,Vento Norte,2020,https://boxd.it/9a7\n',
          ],
        ]),
        author: AUTHOR,
      }),
      TMDB_ON,
    )
    await importZip(fixture, GDPR_ZIP)

    const queue = await fixture.ok(viewQueue, TMDB_ON)
    const vento = queue.items.find((i) => i.name === 'Vento Norte')
    expect(vento?.people).toEqual(['olga', 'vera'])

    await fixture.ok(
      confirmQueueItem({
        id: vento?.id ?? '',
        film: 'tt9000104',
        author: AUTHOR,
      }),
      TMDB_ON,
    )
    expect(
      await query(
        fixture,
        "SELECT pessoa, data, fonte FROM ja_visto WHERE filme_id = 'tt9000104' ORDER BY pessoa",
      ),
    ).toEqual([
      ['olga', '2024-07-16', 'Letterboxd de Olga'],
      ['vera', '2024-03-03', 'TV Time de Vera'],
    ])
  })

  test('a film on the TV Time list is a Declarado in favour', async () => {
    const fixture = useFixture()
    await importZip(fixture, GDPR_ZIP)

    const lines = film(
      await engineRecommendation(fixture, { attendees: ['vera'], count: 50 }),
      'Jardim Suspenso',
    ).evidence['vera']

    expect(lines?.find((l) => l.kind === 'stated')).toMatchObject({
      text: 'está na lista do TV Time',
      source: 'TV Time de Vera',
      date: '2024-09-01',
      strength: 'moderate',
      kind: 'stated',
    })
  })
})

describe('importTvTime, the Liberator export', () => {
  test('films come by their tconst; one without it waits in the queue', async () => {
    const fixture = useFixture()
    const report = await importZip(
      fixture,
      LIBERATOR_ZIP,
      'vera',
      'tv-time-export.zip',
    )

    expect(report.outsideCatalog).toEqual([
      { film: 'tt9099999', title: 'Fora do Catálogo' },
    ])
    expect(report.queue.map((i) => [i.name, i.year])).toEqual([
      ['Filme Perdido', null],
    ])
    const [ratings, seen, watchlist] = await veraFacts(fixture)
    expect(ratings).toEqual([
      ['tt9000202', 4, '2025-03-08', 'TV Time de Vera'],
      ['tt9000303', 5, '2023-06-19', 'TV Time de Vera'],
    ])
    expect(seen).toEqual([
      ['tt9000202', '2025-03-08', 'TV Time de Vera'],
      ['tt9000303', '2023-06-19', 'TV Time de Vera'],
      // No watched_at: the day it was added.
      ['tt9000601', '2024-02-01', 'TV Time de Vera'],
    ])
    expect(watchlist).toEqual([['tt9000301', '2024-10-05', 'TV Time de Vera']])

    const kept = unzipped(readFileSync(join(fixture.data, report.file)))
    expect(kept.names).toEqual(['movies.json'])
    expect(kept.text).not.toContain('SERIE-NAO-LER')
    expect(kept.text).not.toContain('LISTA-NAO-LER')
    // Without TV Time's own ids: the IMDb id and what the reader takes.
    expect(kept.text).not.toContain('tvdb')
    expect(kept.text).not.toContain('uuid')
  })
})

describe('personImports', () => {
  test('counts the TV Time Fatos, and removing the import takes them', async () => {
    const fixture = useFixture()
    const { file } = await importZip(
      fixture,
      LIBERATOR_ZIP,
      'vera',
      'tv-time-export.zip',
    )
    const report = await fixture.ok(personImports('vera'))
    expect(report.imports).toEqual([
      {
        kind: 'tvtime',
        file,
        date: '2026-11-20',
        original: 'tv-time-export.zip',
      },
    ])
    expect(report.tvtime).toEqual({
      ratings: 2,
      seen: 3,
      stated: 0,
      watchlist: 1,
    })

    const removed = await fixture.ok(removeImport({ file, author: AUTHOR }))
    expect(removed.removedFacts).toEqual({
      ratings: 2,
      seen: 3,
      stated: 0,
      watchlist: 1,
    })
    expect((await veraFacts(fixture)).flat()).toEqual([])
  })
})

describe('importTvTime', () => {
  test.each([
    [
      'a ZIP with neither backup',
      zipOf([['notas.csv', 'x']]),
      'backup.zip: o ZIP não tem o tracking-prod-records.csv do export do TV Time nem o movies.json do TV Time Liberator',
    ],
    [
      'records without their columns',
      zipOf([['tracking-prod-records.csv', 'uuid,type\nx,watch\n']]),
      'backup.zip: tracking-prod-records.csv sem as colunas uuid, type, entity_type, alpha_range_key, release_date, created_at e watch_date_range_key',
    ],
    [
      'a movies.json that is not JSON',
      zipOf([['movies.json', '[{']]),
      'backup.zip: movies.json não é um JSON válido',
    ],
    [
      'a movies.json that is not a list',
      zipOf([['movies.json', '{}']]),
      'backup.zip: movies.json não é uma lista de filmes',
    ],
    [
      'bytes that are not a ZIP',
      new TextEncoder().encode('uuid,type\n'),
      'backup.zip: não é um ZIP',
    ],
  ])('%s is invalid_file', async (_, content, message) => {
    const fixture = useFixture()
    expect(
      (
        await fixture.run(
          importTvTime({
            person: 'vera',
            original: 'backup.zip',
            content,
            author: AUTHOR,
          }),
        )
      ).output,
    ).toEqual({ error: { code: 'invalid_file', message } })
  })
})

describe('exportSource', () => {
  test('either TV Time backup is tvtime', () => {
    expect(exportSource(GDPR_ZIP)).toBe('tvtime')
    expect(exportSource(LIBERATOR_ZIP)).toBe('tvtime')
  })
})
