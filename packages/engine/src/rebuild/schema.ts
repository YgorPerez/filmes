// The database's schema: `schema/NN_area.sql`, applied in name order, each
// file as one script (Python's `banco/esquema/*.sql` through `executescript`).
// The tables keep Python's Portuguese names until the cutover (ADR 0004); a
// new table is a new file here, no list to edit.
//
// A rebuild stamps the schema's version (`SCHEMA_VERSION`) in the file's
// `user_version`, and `Sqlite` refuses to open a file with another one
// (#258): the deploy swaps the code and `db:publish` the database, so code
// can reach a database built by another schema, where the first query that
// touches a new column fails as `internal`. The version is a constant, since
// the app's bundle has no `.sql` files to hash; a test holds it to
// `schemaHash()`.

import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'
import { SCHEMA_VERSION } from './schema-version.ts'

const SCHEMA = join(import.meta.dirname, 'schema')

/** The schema files, in the order a rebuild applies them. */
const schemaFiles = (): readonly string[] =>
  readdirSync(SCHEMA)
    .filter((file) => file.endsWith('.sql'))
    .sort()

/** The hash `SCHEMA_VERSION` must equal: the first 28 bits of a SHA-256 of
 * every file's name and text, in order, so it fits SQLite's 32-bit
 * `user_version` and is never 0, the version of a file nothing stamped. */
export const schemaHash = (): number => {
  const hash = createHash('sha256')
  for (const file of schemaFiles()) {
    hash.update(`${file}\0`)
    hash.update(readFileSync(join(SCHEMA, file)))
    hash.update('\0')
  }
  return Number.parseInt(hash.digest('hex').slice(0, 7), 16) || 1
}

/** Creates every table, index and view on an empty database, and stamps
 * the schema's version. */
export const applySchema = (db: Connection): Effect.Effect<void, SqliteError> =>
  Effect.forEach(
    schemaFiles(),
    (file) => db.exec(readFileSync(join(SCHEMA, file), 'utf8')),
    { discard: true },
  ).pipe(
    Effect.andThen(() => db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`)),
  )
