// The full-build comparison (#76 §4.4): schema, counts and rows of two
// databases, REAL exact except the two similarity columns.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, test } from 'vite-plus/test'
import {
  compareDatabases,
  comparisonMarkdown,
} from '../../oracle/compare-databases.ts'

const folders: string[] = []
afterEach(() => {
  for (const folder of folders.splice(0))
    rmSync(folder, { recursive: true, force: true })
})

const SCHEMA = `
CREATE TABLE filmes (id TEXT PRIMARY KEY, votos INTEGER, nota REAL);
CREATE TABLE normas_tags_movielens (filme_id TEXT PRIMARY KEY, norma REAL NOT NULL) WITHOUT ROWID;
CREATE VIEW notas AS SELECT id, nota FROM filmes;
`

/** Two databases with the same schema and `rows` SQL run on each. */
function pair(python: string, ts: string, tsSchema = SCHEMA) {
  const folder = mkdtempSync(join(tmpdir(), 'filmes-compare-databases-'))
  folders.push(folder)
  const make = (name: string, schema: string, sql: string) => {
    const path = join(folder, name)
    const db = new DatabaseSync(path)
    db.exec(schema)
    db.exec(sql)
    db.close()
    return path
  }
  return [
    make('py.sqlite', SCHEMA, python),
    make('ts.sqlite', tsSchema, ts),
  ] as const
}

const ROWS = `
INSERT INTO filmes VALUES ('tt1', 100, 7.5), ('tt2', 200, 8.0);
INSERT INTO normas_tags_movielens VALUES ('tt1', 1.2345678901234567);
`

test('the same rows and schema are clean', () => {
  const [python, ts] = pair(ROWS, ROWS)

  const comparison = compareDatabases(python, ts)

  expect(comparison.clean).toBe(true)
  expect(comparison.tables.map((t) => [t.name, t.python, t.ts])).toEqual([
    ['filmes', 2, 2],
    ['normas_tags_movielens', 1, 1],
  ])
  expect(comparisonMarkdown(comparison)).toContain('**clean**')
})

test('a REAL one ulp off is clean only in a tolerant column', () => {
  const ulp = `
INSERT INTO filmes VALUES ('tt1', 100, 7.5), ('tt2', 200, 8.0);
INSERT INTO normas_tags_movielens VALUES ('tt1', 1.2345678901234569);
`
  const [python, ts] = pair(ROWS, ulp)

  const comparison = compareDatabases(python, ts)

  expect(comparison.clean).toBe(true)
  expect(comparison.tables[1]).toMatchObject({ realDiffering: 1 })
  expect(comparison.tables[1]!.maxRelative).toBeLessThan(1e-15)

  const [left, right] = pair(
    ROWS,
    ROWS.replace("('tt2', 200, 8.0)", "('tt2', 200, 8.000000000000002)"),
  )
  expect(compareDatabases(left, right).tables[0]).toMatchObject({
    onlyPython: 1,
    onlyTs: 1,
  })
  expect(compareDatabases(left, right).clean).toBe(false)
})

test('a tolerant column beyond 1e-12 is a difference', () => {
  const [python, ts] = pair(
    ROWS,
    ROWS.replace('1.2345678901234567', '1.2345678901'),
  )

  expect(compareDatabases(python, ts).clean).toBe(false)
})

test('an extra row and another schema are differences', () => {
  const [python, ts] = pair(
    `${ROWS} INSERT INTO normas_tags_movielens VALUES ('tt2', 1);`,
    ROWS,
    SCHEMA.replace(
      'CREATE VIEW notas AS SELECT id, nota',
      'CREATE VIEW notas AS SELECT id',
    ),
  )

  const comparison = compareDatabases(python, ts)

  expect(comparison.clean).toBe(false)
  expect(comparison.schemaDifferences).toEqual(['view notas: SQL differs'])
  expect(comparison.tables[1]).toMatchObject({
    python: 2,
    ts: 1,
    onlyPython: 1,
  })
})
