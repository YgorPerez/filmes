// The derived database's tables and views with their columns, for the
// console of Operações (#276): the admin sees what to query without
// remembering the schema. `consult` cannot answer it, since its authorizer
// refuses `pragma_table_info`.

import { Effect } from 'effect'
import type { EngineError } from '../runtime/EngineError.ts'
import { Sqlite, type SqliteError } from '../sqlite/Sqlite.ts'

/** A table or a view, with its columns in their order. */
export interface SchemaTable {
  readonly name: string
  readonly kind: 'table' | 'view'
  readonly columns: ReadonlyArray<string>
}

/** Every table and view but SQLite's own, by name. */
export const consultSchema: Effect.Effect<
  ReadonlyArray<SchemaTable>,
  EngineError | SqliteError,
  Sqlite
> = Effect.gen(function* () {
  const sqlite = yield* Sqlite
  return yield* sqlite.read((db) =>
    Effect.gen(function* () {
      const rows = (yield* db.all(
        `SELECT m.name AS name, m.type AS kind, p.name AS column
         FROM sqlite_master m JOIN pragma_table_info(m.name) p
         WHERE m.type IN ('table', 'view') AND m.name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
         ORDER BY m.name, p.cid`,
      )) as ReadonlyArray<{ name: string; kind: 'table' | 'view'; column: string }>
      const tables = new Map<string, SchemaTable & { columns: string[] }>()
      for (const row of rows) {
        const table = tables.get(row.name) ?? {
          name: row.name,
          kind: row.kind,
          columns: [],
        }
        table.columns.push(row.column)
        tables.set(row.name, table)
      }
      return [...tables.values()]
    }),
  )
})
