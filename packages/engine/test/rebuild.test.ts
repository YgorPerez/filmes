// `reconstruir` (tests/test_reconstruir.py), over the fixture's catalog of
// ready tables: the schema, the CSV tables, the loading steps, and the swap
// that never leaves a half-built database. The dumps of the real catalog
// are in rebuild-real.test.ts.
import {
  appendFileSync,
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, test } from 'vite-plus/test'
import { consult, rebuild, type Outcome } from '../src/index.ts'
import { ROOT, useFixture, type Fixture } from './fixture.ts'

const CATALOG = join(ROOT, 'tests/fixture/catalogo')

const errorOf = (outcome: Outcome<unknown>) => {
  expect(outcome.exitCode).not.toBe(0)
  return (outcome.output as { error: { code: string; message: string } }).error
}

/** A fixture with no database, as Python's `cli` (not `banco`). */
function useEmptyFixture(): Fixture {
  const fixture = useFixture()
  rmSync(fixture.database)
  return fixture
}

const rows = async (fixture: Fixture, sql: string) =>
  (await fixture.ok(consult(sql))).rows

/** Every table, its rows sorted. */
async function content(fixture: Fixture) {
  const tables = await rows(
    fixture,
    "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
  )
  const all: Record<string, string[]> = {}
  for (const [table] of tables)
    all[String(table)] = (
      await rows(fixture, `SELECT * FROM "${String(table)}"`)
    )
      .map((row) => JSON.stringify(row))
      .sort()
  return all
}

/** A writable copy of the fixture's catalog. */
function catalogCopy(fixture: Fixture): string {
  const folder = join(fixture.root, 'catalogo')
  cpSync(CATALOG, folder, { recursive: true })
  return folder
}

test('loads the fixture catalog', async () => {
  const fixture = useEmptyFixture()

  await fixture.ok(rebuild)

  const lines = readFileSync(join(CATALOG, 'filmes.csv'), 'utf8').split('\n')
  const csvRows = lines.filter((line) => line !== '').length - 1
  expect(await rows(fixture, 'SELECT count(*) FROM filmes')).toEqual([
    [csvRows],
  ])
})

test('loads the Dono from filmes-dados', async () => {
  const fixture = useEmptyFixture()

  await fixture.ok(rebuild)

  expect(
    await rows(fixture, 'SELECT slug, nome FROM pessoas WHERE dono = 1'),
  ).toEqual([['bruno', 'Bruno']])
})

test('says where the database is and how many rows each table has', async () => {
  const fixture = useEmptyFixture()

  const result = await fixture.ok(rebuild)

  expect(result.database).toBe(fixture.database)
  const names = Object.keys(result.tables)
  expect(names).toEqual([...names].sort())
  expect(names).not.toContain('sqlite_sequence')
  expect(result.tables['filmes']).toBe(
    (await rows(fixture, 'SELECT count(*) FROM filmes'))[0]?.[0],
  )
  expect(result.tables['faixas_etarias']).toBeGreaterThan(0)
  expect(result.tables['normas_tags_movielens']).toBeGreaterThan(0)
  // No temporary file is left next to the database.
  expect(readdirSync(fixture.root).filter((f) => f.endsWith('.novo'))).toEqual(
    [],
  )
})

test('leaves one file, in WAL mode, and drops what the old one left beside it', async () => {
  const fixture = useEmptyFixture()
  // A `-wal` of some other database: SQLite would replay it onto the new file.
  writeFileSync(`${fixture.database}-wal`, 'not this database')
  writeFileSync(`${fixture.database}-shm`, '')

  await fixture.ok(rebuild)

  const name = basename(fixture.database)
  expect(
    readdirSync(fixture.root).filter((file) => file.startsWith(name)),
  ).toEqual([name])
  const db = new DatabaseSync(fixture.database, { readOnly: true })
  try {
    expect(db.prepare('PRAGMA journal_mode').get()).toEqual({
      journal_mode: 'wal',
    })
  } finally {
    db.close()
  }
})

test('twice gives the same database', async () => {
  const fixture = useEmptyFixture()
  await fixture.ok(rebuild)
  const first = await content(fixture)

  await fixture.ok(rebuild)

  expect(await content(fixture)).toEqual(first)
  expect(first['filmes']?.length).toBeGreaterThan(0)
  expect(first['notas']?.length).toBeGreaterThan(0)
  expect(first['arestas']?.length).toBeGreaterThan(0)
})

test('a Fato keeps its id across rebuilds', async () => {
  const fixture = useEmptyFixture()
  const sql = "SELECT fato_id FROM notas WHERE filme_id = 'tt9000101'"
  await fixture.ok(rebuild)
  const before = await rows(fixture, sql)

  await fixture.ok(rebuild)

  expect(await rows(fixture, sql)).toEqual(before)
  expect(before.length).toBeGreaterThan(0)
})

test('a lenient CSV quote joins the field, as Python reads it', async () => {
  const fixture = useFixture()
  const catalog = catalogCopy(fixture)
  const file = join(catalog, 'filmes.csv')
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace(
      'tt9000101,O Farol de Areia,',
      'tt9000101,"O Farol" de Areia,',
    ),
  )

  await fixture.ok(rebuild, { FILMES_CATALOGO: catalog })

  expect(
    await rows(fixture, "SELECT titulo FROM filmes WHERE id = 'tt9000101'"),
  ).toEqual([['O Farol de Areia']])
})

describe('a catalog the schema does not take is refused and the database stays', () => {
  test.each<[string, (catalog: string) => void, string | RegExp]>([
    [
      'a CSV with no table of its name',
      (catalog) => writeFileSync(join(catalog, 'intrusa.csv'), 'a\n1\n'),
      "intrusa.csv: não há tabela 'intrusa' no esquema",
    ],
    [
      'columns outside the schema',
      (catalog) => {
        const file = join(catalog, 'generos_imdb.csv')
        const [header, ...rest] = readFileSync(file, 'utf8').split('\n')
        writeFileSync(file, [`${header},zeta,alfa`, ...rest].join('\n'))
      },
      "generos_imdb.csv: colunas fora do esquema: ['alfa', 'zeta']",
    ],
    [
      'a blank line, which binds no value',
      (catalog) => appendFileSync(join(catalog, 'generos_imdb.csv'), '\n'),
      `generos_imdb.csv, linha 33: Incorrect number of bindings supplied. The current statement uses 3, and there are 0 supplied.`,
    ],
    [
      'a row SQLite refuses',
      (catalog) =>
        appendFileSync(
          join(catalog, 'filmes.csv'),
          'tt9000101,Outro,2001,90,5000,7.5\n',
        ),
      /^filmes\.csv, linha \d+: UNIQUE constraint failed: filmes\.id$/,
    ],
  ])('%s', async (_name, change, message) => {
    const fixture = useFixture()
    const catalog = catalogCopy(fixture)
    change(catalog)
    const before = readFileSync(fixture.database)

    const error = errorOf(
      await fixture.run(rebuild, { FILMES_CATALOGO: catalog }),
    )

    expect(error.code).toBe('invalid_catalog')
    expect(error.message).toMatch(message)
    expect(readFileSync(fixture.database).equals(before)).toBe(true)
    expect(
      readdirSync(fixture.root).filter((f) => f.endsWith('.novo')),
    ).toEqual([])
  })

  test('no catalog folder', async () => {
    const fixture = useFixture()
    const missing = join(fixture.root, 'nada')
    // With no filmes.csv the dumps are read (the database is outside the
    // repo here), and the config's manifest pins dumps the folder lacks.
    const error = errorOf(
      await fixture.run(rebuild, { FILMES_CATALOGO: missing }),
    )
    expect(error.code).toBe('invalid_versions')
    expect(error.message).toMatch(
      new RegExp(`: dump fixado ausente: ${missing}/[0-9a-f]{64}/`),
    )
  })
})

test('an empty CSV loads nothing', async () => {
  const fixture = useFixture()
  const catalog = catalogCopy(fixture)
  writeFileSync(join(catalog, 'vizinhos.csv'), '')

  const result = await fixture.ok(rebuild, { FILMES_CATALOGO: catalog })

  expect(result.tables['vizinhos']).toBe(0)
})

test('a database for the dumps must stay out of the code repository', async () => {
  const fixture = useFixture()

  const error = errorOf(
    await fixture.run(rebuild, {
      FILMES_CATALOGO: join(fixture.root, 'dumps'),
      FILMES_BANCO: join(
        ROOT,
        'node_modules/.cache/filmes-rebuild-test.sqlite',
      ),
    }),
  )

  expect(error).toEqual({
    code: 'invalid_config',
    message: 'ponha FILMES_BANCO fora do repositório de código',
  })
})

test('without filmes-dados configured, says what is missing', async () => {
  const fixture = useEmptyFixture()

  const error = errorOf(await fixture.run(rebuild, { FILMES_DADOS: undefined }))

  expect(error.code).toBe('missing_config')
  expect(error.message).toContain('FILMES_DADOS')
  expect(existsSync(fixture.database)).toBe(false)
  expect(readdirSync(fixture.root).filter((f) => f.endsWith('.novo'))).toEqual(
    [],
  )
})
