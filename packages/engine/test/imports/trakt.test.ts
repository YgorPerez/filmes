// The Trakt import and removing an import (ticket #101), the Vitest twins
// of tests/test_trakt.py and tests/test_importar_remover.py. Teo's export
// comes from tests/fixture/trakt/. Where Python rebuilt the database, these
// reload the imports' Fatos (`reloadLetterboxd` then `reloadTrakt`, the
// loading steps of a rebuild). The RSS import is #100's: here Olga's feed
// is stored from the recording and loaded by her ZIP import.
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  importLetterboxd,
  importTrakt,
  LETTERBOXD_RSS_KIND,
  personCreate,
  personImports,
  personSeen,
  personView,
  readTraktExport,
  reloadLetterboxd,
  reloadTrakt,
  removeImport,
  resolvePerson,
  Sqlite,
  storeImport,
  TRAKT_ATTRIBUTION,
  type Vars,
} from '../../src/index.ts'
import { ROOT, useFixture, type Fixture } from '../fixture.ts'
import { RECORDINGS } from '../sources/support.ts'
import { zipOf, type Member } from './zip.ts'

const TRAKT = join(ROOT, 'tests/fixture/trakt')
const OLGA = join(ROOT, 'tests/fixture/letterboxd/olga')
const AUTHOR = { name: 'Dono', email: 'dono@example.org' }
const TMDB_ON: Vars = {
  FILMES_TMDB_CHAVE: 'chave-de-teste',
  FILMES_GRAVACOES: RECORDINGS,
}

const fixtureFile = (name: string) => readFileSync(join(TRAKT, name))

/** Teo's export, the files in a `trakt-export/` folder, as Trakt sends it. */
const traktZip = (
  names = ['ratings-movies.json', 'watched-history-1.json'],
  extra: Member[] = [],
) =>
  zipOf([
    ...names.map(
      (name) => [`trakt-export/${name}`, fixtureFile(name)] as const,
    ),
    ...extra,
  ])

const importZip = (
  content: Uint8Array,
  person = 'teo',
  original = 'trakt.zip',
) => importTrakt({ person, original, content, author: AUTHOR })

const query = (fixture: Fixture, sql: string, vars: Vars = {}) =>
  fixture.ok(
    Effect.gen(function* () {
      const rows = yield* (yield* Sqlite).read((db) => db.all(sql))
      return rows.map((row) => Object.values(row))
    }),
    vars,
  )

const rebuild = (fixture: Fixture) =>
  fixture.ok(Effect.andThen(reloadLetterboxd, reloadTrakt), {
    FILMES_TMDB_CHAVE: undefined,
  })

describe('importTrakt', () => {
  test('imports the Notas and the history of Trakt', async () => {
    const fixture = useFixture()
    const zip = traktZip()
    const report = await fixture.ok(importZip(zip))

    expect(report.resolved).toEqual({ imdb: 1, tmdb: 1 })
    expect(report.newFacts).toEqual({ ratings: 2, seen: 1, watchlist: 0 })
    // The film of the history has a Nota too: no film is only seen.
    expect(report.changes).toEqual({
      newRatings: 2,
      changedRatings: [],
      repeatedRatings: 0,
      newSeen: 0,
    })
    expect(report.attributions).toEqual([TRAKT_ATTRIBUTION])
    const sha = createHash('sha256').update(zip).digest('hex')
    expect(report.file).toBe(`imports/teo/trakt-${sha}.zip`)
    expect(readFileSync(join(fixture.data, report.file))).toEqual(zip)
    expect(
      await query(
        fixture,
        "SELECT filme_id, nota, data, fonte FROM notas WHERE pessoa = 'teo' ORDER BY filme_id",
      ),
    ).toEqual([
      ['tt9000101', 4.5, '2025-02-05', 'Trakt de Teo'],
      ['tt9000102', 0.5, '2025-04-01', 'Trakt de Teo'],
    ])
    expect(
      await query(
        fixture,
        "SELECT filme_id, tipo, data, fonte, sessao FROM ja_visto WHERE pessoa = 'teo'",
      ),
    ).toEqual([['tt9000101', 'declarado', '2025-02-03', 'Trakt de Teo', null]])
  })
})

describe('importTrakt', () => {
  test('the latest Nota counts, and the database can be rebuilt', async () => {
    const fixture = useFixture()
    const trakt = traktZip()
    const letterboxd = zipOf([
      [
        'ratings.csv',
        'Date,Name,Year,Letterboxd URI,Rating\n' +
          '2025-02-04,O Farol de Areia,2012,https://boxd.it/9a1,2\n' +
          '2025-04-02,Maré Baixa,2015,https://boxd.it/9a2,5\n',
      ],
    ])
    await fixture.ok(importZip(trakt))
    const second = await fixture.ok(
      importLetterboxd({
        person: 'teo',
        original: 'letterboxd.zip',
        content: letterboxd,
        author: AUTHOR,
      }),
    )

    expect(
      await query(
        fixture,
        "SELECT filme_id, nota, fonte FROM notas_vigentes WHERE pessoa = 'teo' ORDER BY filme_id",
      ),
    ).toEqual([
      ['tt9000101', 4.5, 'Trakt de Teo'],
      ['tt9000102', 5, 'Letterboxd de Teo'],
    ])
    // Maré Baixa's newer Letterboxd Nota replaced the Trakt one, and says
    // so; O Farol de Areia kept its newer Trakt Nota (#274).
    expect(second.changes).toEqual({
      newRatings: 0,
      changedRatings: [
        {
          film: 'tt9000102',
          title: 'Maré Baixa',
          year: 2015,
          from: 0.5,
          to: 5,
        },
      ],
      repeatedRatings: 1,
      newSeen: 0,
    })
    const facts = () =>
      query(
        fixture,
        `SELECT fato_id, fonte FROM notas WHERE pessoa = 'teo'
         UNION ALL SELECT fato_id, fonte FROM ja_visto WHERE pessoa = 'teo'
         ORDER BY fato_id`,
      )
    const before = await facts()
    expect(before).toHaveLength(5)
    const again = await fixture.ok(importZip(trakt))
    expect(again.newFile).toBe(false)
    expect(again.newFacts).toEqual({ ratings: 0, seen: 0, watchlist: 0 })
    expect(await facts()).toEqual(before)
    await rebuild(fixture)
    expect(await facts()).toEqual(before)
  })
})

describe('importTrakt', () => {
  test('the paged history wins, and a film outside the Catalog is reported', async () => {
    const fixture = useFixture()
    const history = JSON.parse(
      fixtureFile('watched-history-1.json').toString(),
    ) as [Record<string, unknown>]
    const otherSession = {
      ...history[0],
      id: 1111111120,
      watched_at: '2025-02-03T21:00:00.000Z',
    }
    const outside = {
      id: 1111111121,
      watched_at: '2025-02-04T21:00:00.000Z',
      type: 'movie',
      movie: { title: 'Filme perdido', ids: { imdb: 'tt9999999', trakt: 99 } },
    }
    const zip = traktZip(
      ['watched-history-1.json'],
      [
        {
          name: 'watched-history-2.json',
          content: JSON.stringify([otherSession, outside]),
        },
        {
          name: 'watched-movies.json',
          content: JSON.stringify([
            {
              plays: 2,
              last_watched_at: '2025-02-01T21:00:00.000Z',
              movie: history[0].movie,
            },
          ]),
        },
      ],
    )
    const report = await fixture.ok(importZip(zip))

    expect(report.facts).toEqual({ ratings: 0, seen: 2, watchlist: 0 })
    expect(report.unresolved).toEqual([
      { name: 'Filme perdido', imdb: 'tt9999999', tmdb: null, trakt: 99 },
    ])
    // Her import page lists it later, once, from the ZIP she keeps (#274).
    expect((await fixture.ok(personImports('teo'))).leftOut.trakt).toEqual([
      { name: 'Filme perdido', year: null, id: 'tt9999999' },
    ])
  })
})

describe('importTrakt', () => {
  test('an export without Trakt files is not kept', async () => {
    const fixture = useFixture()
    const outcome = await fixture.run(
      importZip(zipOf([['profile.json', '{}']]), 'teo', 'outro.zip'),
    )

    expect(outcome).toEqual({
      exitCode: 1,
      output: {
        error: {
          code: 'invalid_file',
          message: 'outro.zip: ZIP sem notas ou histórico do Trakt',
        },
      },
    })
    expect(existsSync(join(fixture.data, 'imports/teo'))).toBe(false)
  })

  test('the watched-movies summary counts when there is no history', async () => {
    const fixture = useFixture()
    const zip = zipOf([
      [
        'watched-movies.json',
        JSON.stringify([
          {
            last_watched_at: '2025-02-01T21:00:00.000Z',
            movie: {
              title: 'Maré Baixa',
              ids: { imdb: null, tmdb: 9003, trakt: 25 },
            },
          },
        ]),
      ],
    ])
    const report = await fixture.ok(importZip(zip))
    expect(report.resolved).toEqual({ imdb: 0, tmdb: 1 })
    expect(
      await query(
        fixture,
        "SELECT filme_id, data FROM ja_visto WHERE pessoa = 'teo'",
      ),
    ).toEqual([['tt9000102', '2025-02-01']])
  })
})

describe('importTrakt', () => {
  test('a TMDB id two films share does not resolve', async () => {
    const fixture = useFixture()
    await fixture.ok(
      Effect.flatMap(Sqlite, (s) =>
        s.write((db) =>
          db.run(
            "INSERT INTO slugs_letterboxd (slug, item, imdb, tmdb) VALUES ('outro', 'Q1', 'tt9000101', '9003')",
          ),
        ),
      ),
    )
    const report = await fixture.ok(
      importZip(traktZip(['ratings-movies.json'])),
    )
    expect(report.resolved).toEqual({ imdb: 1, tmdb: 0 })
    expect(report.unresolved).toEqual([
      { name: 'Maré Baixa', imdb: null, tmdb: '9003', trakt: 25 },
    ])
  })
})

describe('readTraktExport', () => {
  test.each([
    ['not a ZIP', Buffer.from('not a zip'), 'x.zip: ZIP do Trakt inválido'],
    [
      'an encrypted member',
      zipOf([{ name: 'ratings.json', content: '[]', encrypted: true }]),
      'x.zip: ZIP do Trakt inválido',
    ],
    [
      'a folder named like a file',
      zipOf([['ratings.json/', '']]),
      'x.zip: ZIP sem notas ou histórico do Trakt',
    ],
    [
      'invalid JSON',
      zipOf([['history.json', '[']]),
      'history.json: JSON inválido',
    ],
    [
      'a Nota of 1 to 10 as a float',
      zipOf([
        [
          'ratings-2.json',
          '[{"type": "movie", "rating": 9.0, "rated_at": "2025-01-01"}]',
        ],
      ]),
      'ratings-2.json, item 1: nota fora da escala inteira de 1 a 10',
    ],
  ])('%s', (_, content, message) => {
    expect(() => readTraktExport('x.zip', content)).toThrow(message)
  })

  test('an unsupported compression method is not a valid ZIP', () => {
    const zip = zipOf([['ratings.json', '[]']])
    // The method field of the local header and of the central directory.
    zip.writeUInt16LE(12, 8)
    zip.writeUInt16LE(12, zip.indexOf(Buffer.from([0x50, 0x4b, 1, 2])) + 10)
    expect(() => readTraktExport('x.zip', zip)).toThrow(
      'x.zip: ZIP do Trakt inválido',
    )
  })
})

const olgaZip = () =>
  zipOf(
    ['diary.csv', 'ratings.csv', 'reviews.csv', 'watched.csv', 'watchlist.csv']
      .filter((name) => existsSync(join(OLGA, name)))
      .map((name) => [name, readFileSync(join(OLGA, name))] as const),
  )

const olgaRatings = (fixture: Fixture) =>
  query(
    fixture,
    "SELECT filme_id, data, fonte FROM notas WHERE pessoa = 'olga' ORDER BY data, filme_id",
  )

/** Stores the recorded RSS as Olga's import and gives its file. */
const storeOlgaRss = (fixture: Fixture) => {
  const feed = readFileSync(
    join(ROOT, 'tests/fixture/gravacoes/letterboxd/rss-olga_farol.xml'),
  )
  return fixture.ok(
    Effect.gen(function* () {
      const olga = yield* resolvePerson('olga')
      return (yield* storeImport(
        olga,
        LETTERBOXD_RSS_KIND,
        'https://letterboxd.com/olga_farol/rss/',
        feed,
        'xml',
      )).file
    }),
  )
}

const olgaFacts = (fixture: Fixture) =>
  query(
    fixture,
    "SELECT fato_id FROM notas WHERE pessoa = 'olga' UNION ALL SELECT fato_id FROM ja_visto WHERE pessoa = 'olga' ORDER BY 1",
  )

describe('removeImport', () => {
  test('removing the RSS leaves only the Fatos of the ZIP', async () => {
    const fixture = useFixture()
    await fixture.ok(personCreate({ name: 'Olga' }))
    const rss = await storeOlgaRss(fixture)
    const zip = (
      await fixture.ok(
        importLetterboxd({
          person: 'olga',
          original: 'letterboxd-olga.zip',
          content: olgaZip(),
          author: AUTHOR,
        }),
        TMDB_ON,
      )
    ).file
    expect(await olgaRatings(fixture)).toContainEqual([
      'tt9000101',
      '2024-05-05',
      'RSS do Letterboxd de Olga',
    ])

    const removed = await fixture.ok(
      removeImport({ file: rss, author: AUTHOR }),
      TMDB_ON,
    )

    expect(removed.person).toBe('olga')
    expect(removed.removed).toMatchObject({ file: rss, kind: 'letterboxd-rss' })
    expect(removed.removedFacts.ratings).toBeGreaterThanOrEqual(1)
    expect(existsSync(join(fixture.data, rss))).toBe(false)
    expect(existsSync(join(fixture.data, zip))).toBe(true)
    expect(
      (await fixture.ok(personView('olga'))).imports.map(
        (i) => (i as { file: string }).file,
      ),
    ).toEqual([zip])
    expect(
      new Set((await olgaRatings(fixture)).map(([, , source]) => source)),
    ).toEqual(new Set(['Letterboxd de Olga']))
    const facts = () => olgaFacts(fixture)
    const after = await facts()
    await rebuild(fixture)
    expect(await facts()).toEqual(after)
  })
})

describe('removeImport', () => {
  test("removing Trakt's last import takes all its Fatos", async () => {
    const fixture = useFixture()
    const { file } = await fixture.ok(importZip(traktZip()))
    await fixture.ok(personSeen({ person: 'teo', film: 'tt9000601' }))

    const removed = await fixture.ok(
      removeImport({
        file: file.slice(file.lastIndexOf('/') + 1),
        person: 'teo',
        author: AUTHOR,
      }),
    )

    expect(removed.removedFacts).toEqual({
      ratings: 2,
      seen: 1,
      stated: 0,
      watchlist: 0,
    })
    expect((await fixture.ok(personView('teo'))).imports).toEqual([])
    expect(existsSync(join(fixture.data, file))).toBe(false)
    expect(
      await query(
        fixture,
        "SELECT filme_id, fonte FROM ja_visto WHERE pessoa = 'teo' UNION ALL SELECT filme_id, fonte FROM notas WHERE pessoa = 'teo'",
      ),
    ).toEqual([['tt9000601', 'conversa com o Dono']])
  })

  test("a file that is not the Pessoa's import is an error", async () => {
    const fixture = useFixture()
    const { file } = await fixture.ok(importZip(traktZip()))

    const outcome = await fixture.run(
      removeImport({ file, person: 'iara', author: AUTHOR }),
    )

    expect(outcome).toEqual({
      exitCode: 1,
      output: {
        error: {
          code: 'unknown_import',
          message: `nenhum import de iara tem o arquivo '${file}'; veja \`imports\` em \`pessoa ver\``,
        },
      },
    })
    expect(existsSync(join(fixture.data, file))).toBe(true)
    expect((await fixture.ok(personView('teo'))).imports).toHaveLength(1)
  })
})

describe('removeImport', () => {
  test('a name two imports share is ambiguous; an unknown one names no Pessoa', async () => {
    const fixture = useFixture()
    const zip = traktZip()
    const teo = (await fixture.ok(importZip(zip))).file
    const iara = (await fixture.ok(importZip(zip, 'iara'))).file
    const name = teo.slice(teo.lastIndexOf('/') + 1)

    expect(
      (await fixture.run(removeImport({ file: name, author: AUTHOR }))).output,
    ).toEqual({
      error: {
        code: 'ambiguous_import',
        message: `'${name}' pode ser mais de um import: ${iara}, ${teo}`,
      },
    })
    expect(
      (await fixture.run(removeImport({ file: 'x.zip', author: AUTHOR })))
        .output,
    ).toEqual({
      error: {
        code: 'unknown_import',
        message:
          "nenhum import tem o arquivo 'x.zip'; veja `imports` em `pessoa ver`",
      },
    })
  })

  test('an outdated database is refused before anything changes', async () => {
    const fixture = useFixture()
    const { file } = await fixture.ok(importZip(traktZip()))
    await fixture.ok(
      Effect.flatMap(Sqlite, (s) =>
        s.write((db) => db.exec('DROP TABLE itens_letterboxd')),
      ),
    )

    expect(
      (await fixture.run(removeImport({ file, author: AUTHOR }))).output,
    ).toEqual({
      error: {
        code: 'outdated_database',
        message:
          'o banco ainda não tem o import do Letterboxd. Rode `reconstruir`.',
      },
    })
    expect(existsSync(join(fixture.data, file))).toBe(true)
    expect((await fixture.run(importZip(traktZip()))).exitCode).toBe(1)
  })
})
