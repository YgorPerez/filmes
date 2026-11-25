// The database's schema: `schema/NN_area.sql`, applied in name order, each
// file as one script (Python's `banco/esquema/*.sql` through `executescript`).
// The tables keep Python's Portuguese names until the cutover (ADR 0004); a
// new table is a new file here, no list to edit.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'

const SCHEMA = join(import.meta.dirname, 'schema')

/** The schema files, in the order a rebuild applies them. */
export const schemaFiles = (): readonly string[] =>
  readdirSync(SCHEMA)
    .filter((file) => file.endsWith('.sql'))
    .sort()

/** Creates every table, index and view on an empty database. */
export const applySchema = (db: Connection): Effect.Effect<void, SqliteError> =>
  Effect.forEach(
    schemaFiles(),
    (file) => db.exec(readFileSync(join(SCHEMA, file), 'utf8')),
    { discard: true },
  )
