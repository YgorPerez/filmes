// The import tools (#110): the old MCP's letterboxd.test, trakt.test and
// the import part of remover.test. The ZIPs go up through the app, not the
// MCP, so the tests put them in with the engine and do the rest through
// the tools; the IMDb CSV is text, and goes through the tool (#285), as does Simkl's
// backup JSON (#299). TMDB answers from the recordings; nothing touches the network.
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { importLetterboxd, importTrakt, type Vars } from '@filmes/engine'
import { describe, test } from 'vite-plus/test'
import { ROOT, useFixture, type Fixture } from '../../engine/test/fixture.ts'
import { zipOf } from '../../engine/test/imports/zip.ts'
import { RECORDINGS } from '../../engine/test/sources/support.ts'
import { connect, failureText } from './connect.ts'

const OLGA = join(ROOT, 'tests/fixture/letterboxd/olga')
const TRAKT = join(ROOT, 'tests/fixture/trakt')
const AUTHOR = { name: 'Dono', email: 'dono@example.org' }
const RECORDED: Vars = { FILMES_GRAVACOES: RECORDINGS }
const TMDB_ON: Vars = { ...RECORDED, FILMES_TMDB_CHAVE: 'chave-de-teste' }

/** Olga's Letterboxd export, or only some of its files. */
const olgaZip = (only?: readonly string[]) =>
  zipOf(
    readdirSync(OLGA)
      .filter((name) => name.endsWith('.csv'))
      .filter((name) => only === undefined || only.includes(name))
      .sort()
      .map((name) => [name, readFileSync(join(OLGA, name))] as const),
  )

const importZip = (fixture: Fixture, content: Uint8Array, vars: Vars) =>
  fixture.ok(
    importLetterboxd({
      person: 'iara',
      original: 'export.zip',
      content,
      author: AUTHOR,
    }),
    vars,
  )

describe('import_queue', () => {
  test('confirms or discards what the import left for the Dono', async () => {
    const fixture = useFixture()
    const report = await importZip(fixture, olgaZip(), TMDB_ON)
    const c = await connect(fixture, null, TMDB_ON)

    const { items } = await c.ok('import_queue', { action: 'view' })
    const vento = items.find((i: { name: string }) => i.name === 'Vento Norte')
    const lost = items.find((i: { name: string }) => i.name === 'Filme Perdido')
    const confirmed = await c.ok('import_queue', {
      action: 'confirm',
      id: vento.id,
      film: 'tt9000302',
    })
    const discarded = await c.ok('import_queue', {
      action: 'discard',
      id: lost.id,
      reason: 'não é filme',
    })

    assert.equal(report.queued, 2)
    assert.equal(items.length, 2)
    assert.deepEqual([confirmed.film, confirmed.new], ['tt9000302', true])
    assert.deepEqual(
      [discarded.discardReason, discarded.new],
      ['não é filme', true],
    )
    assert.deepEqual((await c.ok('import_queue', { action: 'view' })).items, [])
  })

  test('discards with "ignorar" by default; a decision needs the item', async () => {
    const fixture = useFixture()
    await importZip(fixture, olgaZip(), TMDB_ON)
    const c = await connect(fixture, null, TMDB_ON)
    const [item] = (await c.ok('import_queue', { action: 'view' })).items

    const discarded = await c.ok('import_queue', {
      action: 'discard',
      id: item.id,
    })

    assert.equal(discarded.discardReason, 'ignorar')
    for (const [args, message] of [
      [
        { action: 'confirm', film: 'tt9000302' },
        'import_queue confirm precisa de id',
      ],
      [{ action: 'discard' }, 'import_queue discard precisa de id'],
      [
        { action: 'confirm', id: item.id },
        'import_queue confirm precisa de film',
      ],
    ] as const)
      assert.deepEqual((await c.error('import_queue', args)).error, {
        code: 'invalid_usage',
        message,
      })
  })

  test('asks TMDB again for one Pessoa', async () => {
    const fixture = useFixture()
    // Imported with no TMDB key: Rio Abaixo waits in the queue.
    await importZip(fixture, olgaZip(['watched.csv']), RECORDED)
    const c = await connect(fixture, null, TMDB_ON)

    const result = await c.ok('import_queue', {
      action: 'reprocess',
      person: 'iara',
    })

    assert.deepEqual(result.people, ['iara'])
    // Without a Pessoa, every one.
    assert.deepEqual(
      (await c.ok('import_queue', { action: 'reprocess' })).people,
      ['bruno', 'iara', 'quim', 'rosa', 'teo', 'vera'],
    )
    assert.ok(
      result.resolved.some((i: { name: string }) => i.name === 'Rio Abaixo'),
    )
  })
})

describe('import', () => {
  test('imports the public RSS only with the consent of the Pessoa', async () => {
    const fixture = useFixture()
    const c = await connect(fixture, null, TMDB_ON)

    const refused = await c.error('import', {
      person: 'iara',
      letterboxdRss: 'olga_farol',
    })
    assert.equal(refused.error.code, 'invalid_usage')
    assert.deepEqual(
      (await c.ok('person', { action: 'view', person: 'iara' })).imports,
      [],
    )

    const report = await c.ok('import', {
      person: 'iara',
      letterboxdRss: 'olga_farol',
      consent: true,
    })

    assert.equal(report.newFacts.ratings, 4)
    assert.equal(report.queued, 0)
    assert.match(
      failureText(
        await c.call('import', {
          person: 'iara',
          letterboxdRss: '../x',
          consent: true,
        }),
      ),
      /usuário do Letterboxd/,
    )
  })

  test('removes a Trakt import and the Fatos only it brought', async () => {
    const fixture = useFixture()
    const zip = zipOf(
      ['ratings-movies.json', 'watched-history-1.json'].map(
        (name) => [name, readFileSync(join(TRAKT, name))] as const,
      ),
    )
    const imported = await fixture.ok(
      importTrakt({
        person: 'teo',
        original: 'trakt.zip',
        content: zip,
        author: AUTHOR,
      }),
    )
    const c = await connect(fixture)

    const removed = await c.ok('import', { remove: imported.file })

    assert.deepEqual(imported.newFacts, { ratings: 2, seen: 1, watchlist: 0 })
    assert.equal(removed.person, 'teo')
    assert.deepEqual(removed.removedFacts, {
      ratings: 2,
      seen: 1,
      stated: 0,
      watchlist: 0,
    })
    assert.equal(existsSync(join(fixture.data, imported.file)), false)
    assert.equal(
      (await c.error('import', { person: 'teo', remove: imported.file })).error
        .code,
      'unknown_import',
    )
  })

  test("imports an IMDb ratings CSV sent as text, and refuses one that isn't", async () => {
    const fixture = useFixture()
    const c = await connect(fixture)
    const csv = readFileSync(join(ROOT, 'tests/fixture/imdb/vera.csv'), 'utf8')

    const report = await c.ok('import', { person: 'vera', imdbCsv: csv })

    assert.equal(report.person, 'vera')
    assert.deepEqual(report.newFacts, { ratings: 3 })
    assert.deepEqual(report.outsideCatalog, [
      { film: 'tt9028501', title: 'Cais, Episódio 1' },
    ])
    assert.match(report.file, /^imports\/vera\/imdb-[0-9a-f]{64}\.csv$/)
    assert.deepEqual(
      (await c.ok('person', { action: 'view', person: 'vera' })).imports.map(
        (record: { kind: string; original: string }) => [
          record.kind,
          record.original,
        ],
      ),
      [['imdb', 'vera-imdb-ratings.csv']],
    )
    assert.deepEqual(
      (await c.error('import', { person: 'vera', imdbCsv: 'Date,Name\n' }))
        .error,
      {
        code: 'invalid_file',
        message:
          'vera-imdb-ratings.csv: CSV sem as colunas Const, Your Rating e Date Rated do IMDb',
      },
    )
  })

  test("imports Simkl's backup JSON as text", async () => {
    const c = await connect(useFixture(), null, TMDB_ON)
    const json = readFileSync(
      join(ROOT, 'tests/fixture/simkl/SimklBackup.json'),
      'utf8',
    )

    const report = await c.ok('import', { person: 'vera', simklJson: json })

    assert.equal(report.person, 'vera')
    assert.deepEqual(report.newFacts, { ratings: 3, seen: 2, watchlist: 1 })
    assert.deepEqual(report.resolved, { imdb: 4, tmdb: 2 })
    assert.deepEqual(
      report.unresolved.map((film: { name: string }) => film.name),
      ['Filme Perdido', 'Filme Sem Ids'],
    )
    assert.match(report.file, /^imports\/vera\/simkl-[0-9a-f]{64}\.json$/)
    assert.deepEqual(
      (await c.ok('person', { action: 'view', person: 'vera' })).imports.map(
        (record: { kind: string; original: string }) => [
          record.kind,
          record.original,
        ],
      ),
      [['simkl', 'SimklBackup.json']],
    )
    assert.deepEqual(
      (await c.error('import', { person: 'vera', simklJson: '{"user": {}}' }))
        .error,
      {
        code: 'invalid_file',
        message:
          'SimklBackup.json: JSON sem movies nem anime de um backup do Simkl',
      },
    )
  })

  test('imports a TV Time backup sent in base64', async () => {
    const fixture = useFixture()
    const c = await connect(fixture)
    const folder = join(ROOT, 'tests/fixture/tvtime/liberator')
    const zip = zipOf(
      readdirSync(folder)
        .sort()
        .map((file) => [file, readFileSync(join(folder, file))] as const),
    )

    const report = await c.ok('import', {
      person: 'vera',
      tvtimeZip: zip.toString('base64'),
    })

    assert.equal(report.person, 'vera')
    assert.deepEqual(report.newFacts, {
      ratings: 2,
      seen: 3,
      stated: 0,
      watchlist: 1,
    })
    assert.deepEqual(report.outsideCatalog, [
      { film: 'tt9099999', title: 'Fora do Catálogo' },
    ])
    assert.deepEqual(
      report.queue.map((item: { name: string }) => item.name),
      ['Filme Perdido'],
    )
    assert.match(report.file, /^imports\/vera\/tvtime-[0-9a-f]{64}\.zip$/)
    assert.deepEqual(
      (
        await c.error('import', {
          person: 'vera',
          tvtimeZip: Buffer.from('não é ZIP').toString('base64'),
        })
      ).error,
      { code: 'invalid_file', message: 'vera-tvtime.zip: não é um ZIP' },
    )
  })

  test('takes one thing per call, and the RSS, the CSV and the backups need the Pessoa', async () => {
    const c = await connect(useFixture())

    for (const [args, message] of [
      [
        { person: 'teo' },
        'mande letterboxdRss, imdbCsv, simklJson, tvtimeZip ou remove, um só',
      ],
      [
        { person: 'teo', letterboxdRss: 'x', remove: 'y' },
        'mande letterboxdRss, imdbCsv, simklJson, tvtimeZip ou remove, um só',
      ],
      [
        { person: 'teo', imdbCsv: 'x', remove: 'y' },
        'mande letterboxdRss, imdbCsv, simklJson, tvtimeZip ou remove, um só',
      ],
      [{ letterboxdRss: 'x', consent: true }, 'o RSS precisa de person'],
      [{ imdbCsv: 'x' }, 'o CSV do IMDb precisa de person'],
      [
        { person: 'teo', imdbCsv: 'x', simklJson: 'y' },
        'mande letterboxdRss, imdbCsv, simklJson, tvtimeZip ou remove, um só',
      ],
      [{ simklJson: 'x' }, 'o backup do Simkl precisa de person'],
      [{ tvtimeZip: 'eA==' }, 'o backup do TV Time precisa de person'],
    ] as const)
      assert.deepEqual((await c.error('import', args)).error, {
        code: 'invalid_usage',
        message,
      })
  })
})

describe('export', () => {
  test("hands back Bruno's Notas as IMDb's ratings CSV", async () => {
    const c = await connect(useFixture())

    const result = await c.ok('export', { person: 'dono', format: 'imdb' })

    const lines = result.content.trim().split(/\r?\n/)
    assert.equal(result.person, 'bruno')
    assert.match(lines[0], /^Const,Your Rating,Date Rated,Title,/)
    assert.equal(lines.length - 1, result.ratings)
    assert.ok(result.ratings > 0)
    assert.match(
      failureText(await c.call('export', { person: 'bruno', format: 'csv' })),
      /format/,
    )
  })

  test("hands back Bruno's Notas as the CSV Letterboxd imports", async () => {
    const c = await connect(useFixture())

    const result = await c.ok('export', {
      person: 'dono',
      format: 'letterboxd',
    })

    const lines = result.content.trim().split('\r\n')
    assert.equal(result.format, 'letterboxd')
    assert.equal(lines[0], 'imdbID,Title,Year,Rating10,WatchedDate,Review')
    assert.equal(
      lines.find((line: string) => line.startsWith('tt9000101,')),
      'tt9000101,O Farol de Areia,2012,10,2025-06-01,',
    )
    assert.equal(lines.length - 1, result.ratings)
  })
})
