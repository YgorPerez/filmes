// `consultar` (tests/test_consultar.py): one read-only query, columns and
// rows; anything that writes is refused and the database stays as it was.
import { describe, expect, test } from 'vite-plus/test'
import { consult, consultSchema } from '../src/index.ts'
import { useFixture } from './fixture.ts'

const errorOf = (outcome: { exitCode: number; output: unknown }) => {
  expect(outcome.exitCode).toBe(1)
  return (outcome.output as { error: { code: string; message: string } }).error
}

test('returns the columns and the rows', async () => {
  const fixture = useFixture()

  const result = await fixture.ok(
    consult("SELECT titulo, ano FROM filmes WHERE id = 'tt9000101'"),
  )

  expect(result).toEqual({
    columns: ['titulo', 'ano'],
    rows: [['O Farol de Areia', 2012]],
  })
})

describe.each([
  'DELETE FROM filmes',
  "UPDATE filmes SET titulo = 'x'",
  "INSERT INTO pessoas (slug, nome) VALUES ('x', 'X')",
  'DROP TABLE filmes',
  'CREATE TABLE intrusa (x)',
  "ATTACH DATABASE ':memory:' AS outro",
  'PRAGMA writable_schema = ON',
  'BEGIN',
  "SELECT * FROM pragma_table_info('filmes')",
])('%s', (sql) => {
  test('is refused as a write and the database stays intact', async () => {
    const fixture = useFixture()
    const count = consult('SELECT count(*) FROM filmes')
    const before = await fixture.ok(count)

    const outcome = await fixture.run(consult(sql))

    expect(errorOf(outcome)).toEqual({
      code: 'read_only',
      message: 'consultar só aceita leitura (SELECT)',
    })
    expect(await fixture.ok(count)).toEqual(before)
  })
})

test('a broken query is an SQL error with SQLite’s message', async () => {
  const fixture = useFixture()

  const outcome = await fixture.run(consult('SELEC nada'))

  expect(errorOf(outcome)).toEqual({
    code: 'invalid_sql',
    message: 'near "SELEC": syntax error',
  })
})

test('an error while running is an SQL error too', async () => {
  const fixture = useFixture()

  const outcome = await fixture.run(consult('SELECT abs(-9223372036854775808)'))

  expect(errorOf(outcome)).toEqual({
    code: 'invalid_sql',
    message: 'integer overflow',
  })
})

describe('one statement, as Python’s sqlite3 runs it', () => {
  test.each([
    'SELECT 1; SELECT 2',
    'SELECT 1;;',
    "SELECT 'é'; DELETE FROM filmes",
    'SELECT 1; -',
  ])('%s is refused', async (sql) => {
    const fixture = useFixture()

    const outcome = await fixture.run(consult(sql))

    expect(errorOf(outcome)).toEqual({
      code: 'invalid_sql',
      message: 'You can only execute one statement at a time.',
    })
  })

  test.each([
    'SELECT 1;  -- fim',
    'SELECT 1; /* sem fim',
    'SELECT 1; /* a */ -- b\n',
    ' ; SELECT 1',
  ])('%s ends in blanks and comments', async (sql) => {
    const fixture = useFixture()

    expect(await fixture.ok(consult(sql))).toEqual({
      columns: ['1'],
      rows: [[1]],
    })
  })

  test.each(['', '  ', ';', '-- só'])(
    '%j has no statement and no row',
    async (sql) => {
      const fixture = useFixture()

      expect(await fixture.ok(consult(sql))).toEqual({ columns: [], rows: [] })
    },
  )
})

describe('parameters, which consultar never binds', () => {
  test.each([
    ['SELECT ?', 1],
    ['SELECT ?, ?', 2],
    ['SELECT ?3, :a, :a', 4],
    ['SELECT ?1, ?', 2],
    ['SELECT :a, ?1', 1],
    ['SELECT @x, $y, $y::z(1), :x', 4],
    ["SELECT '?' AS \"?\", 1 AS [?], 2 AS `?`, x'00' -- ?\n, ? /* ? */", 1],
    ["SELECT 'it''s ?', a$b FROM (SELECT 1 AS a$b) WHERE ? IS NULL", 1],
  ])('%s takes %i', async (sql, count) => {
    const fixture = useFixture()

    const outcome = await fixture.run(consult(sql))

    expect(errorOf(outcome)).toEqual({
      code: 'invalid_sql',
      message: `Incorrect number of bindings supplied. The current statement uses ${count}, and there are 0 supplied.`,
    })
  })
})

test('values come out as JSON can carry them', async () => {
  const fixture = useFixture()

  const result = await fixture.ok(
    consult(
      "SELECT 9007199254740991, 9007199254740993, -9223372036854775808, 2.5, x'0aff', NULL, 'texto', 1 AS a, 2 AS a",
    ),
  )

  expect(result.columns.slice(-2)).toEqual(['a', 'a'])
  expect(result.rows).toEqual([
    [
      9007199254740991,
      '9007199254740993',
      '-9223372036854775808',
      2.5,
      "X'0AFF'",
      null,
      'texto',
      1,
      2,
    ],
  ])
})

test('a recursive query reads', async () => {
  const fixture = useFixture()

  const result = await fixture.ok(
    consult(
      'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 3) SELECT x FROM c',
    ),
  )

  expect(result).toEqual({ columns: ['x'], rows: [[1], [2], [3]] })
})

test('lists the tables and views with their columns, for the console', async () => {
  const fixture = useFixture()

  const schema = await fixture.ok(consultSchema)

  expect(schema.find((t) => t.name === 'filmes')).toMatchObject({
    name: 'filmes',
    kind: 'table',
    columns: expect.arrayContaining(['id', 'titulo', 'ano']),
  })
  expect(schema.find((t) => t.name === 'filmes')?.columns[0]).toBe('id')
  expect(schema.find((t) => t.name === 'notas_vigentes')?.kind).toBe('view')
  expect(schema.some((t) => t.name.startsWith('sqlite_'))).toBe(false)
  const names = schema.map((t) => t.name)
  expect(names).toEqual([...names].sort())
})
