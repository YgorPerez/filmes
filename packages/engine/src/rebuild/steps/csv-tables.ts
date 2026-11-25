// `20_tabelas_csv` (`catalogo/tabelas.py`): `<catalog>/<table>.csv` goes
// straight into `<table>`. The header names the columns; when the table has
// `fato_id` and the CSV does not, the id comes from the row's content. An
// empty cell is NULL. A CSV with no table of its name is an error, so the
// fixture has no forgotten file.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { compareTuple } from '../../compat/compare.ts'
import { factId } from '../../compat/fact-id.ts'
import { pyReprStr } from '../../compat/text.ts'
import { CsvReader } from '../../imports/csv.ts'
import { engineError } from '../../runtime/EngineError.ts'
import { Environment } from '../../runtime/Environment.ts'
import type { Connection } from '../../sqlite/Sqlite.ts'
import type { Step } from './Step.ts'

/** Python's `sorted` of str: code point order. */
const byCodePoint = (a: string, b: string) => compareTuple([a], [b])

const loadCsv = (db: Connection, table: string, folder: string) =>
  Effect.gen(function* () {
    const file = `${table}.csv`
    const tableColumns = (yield* db.all(`PRAGMA table_info("${table}")`)).map(
      (row) => String(row['name']),
    )
    const reader = new CsvReader(
      readFileSync(join(folder, file), 'utf8'),
      false,
    )
    const header = reader.next()
    if (header === null || header.length === 0) return
    const unknown = [...new Set(header)]
      .filter((name) => !tableColumns.includes(name))
      .sort(byCodePoint)
    if (unknown.length > 0)
      return yield* engineError(
        'invalid_catalog',
        `${file}: colunas fora do esquema: [${unknown.map(pyReprStr).join(', ')}]`,
      )
    const makeId =
      tableColumns.includes('fato_id') && !header.includes('fato_id')
    const columns = makeId ? [...header, 'fato_id'] : header
    const sql = `INSERT INTO "${table}" (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
    for (let line = 2; ; line++) {
      const row = reader.next()
      if (row === null) return
      const values: (string | null)[] = row.map((v) => (v === '' ? null : v))
      if (makeId) values.push(factId(table, ...row))
      if (values.length !== columns.length)
        // Where sqlite3 refuses the bindings; node:sqlite would bind NULLs.
        return yield* engineError(
          'invalid_catalog',
          `${file}, linha ${line}: Incorrect number of bindings supplied. The current statement uses ${columns.length}, and there are ${values.length} supplied.`,
        )
      yield* db
        .run(sql, ...values)
        .pipe(
          Effect.catchTag('SqliteError', (error) =>
            Effect.fail(
              engineError(
                'invalid_catalog',
                `${file}, linha ${line}: ${error.message}`,
              ),
            ),
          ),
        )
    }
  })

export const csvTables: Step = {
  name: '20_tabelas_csv',
  load: (db) =>
    Effect.gen(function* () {
      // `11_catalogo_real` already refused a folder without filmes.csv, so
      // Python's "pasta do catálogo não encontrada" cannot happen here.
      const folder = yield* (yield* Environment).path('catalog')
      // In the order the schema created them, so foreign keys hold.
      const tables = (yield* db.all(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY rowid",
      )).map((row) => String(row['name']))
      for (const file of readdirSync(folder)
        .filter((name) => name.endsWith('.csv'))
        .sort(byCodePoint)) {
        const stem = file.slice(0, -'.csv'.length)
        if (!tables.includes(stem))
          return yield* engineError(
            'invalid_catalog',
            `${file}: não há tabela '${stem}' no esquema`,
          )
      }
      for (const table of tables)
        if (existsSync(join(folder, `${table}.csv`)))
          yield* loadCsv(db, table, folder)
    }),
}
