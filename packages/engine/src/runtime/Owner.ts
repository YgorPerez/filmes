// The Dono of a request (#76 §6.4): who "dono" is, who opens a Session, and
// who signs the filmes-dados commit. The Python engine took the one Pessoa
// with `dono: true`; with several Donos, it is the Pessoa logged in to the
// app or the MCP, which the edge passes to `engine.run(op, { owner })`.
// Without one (a script, the tests), the database's Dono stands in, as in
// the Python engine: the first slug with `dono = 1`.

import { Context, Effect } from 'effect'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'

/** The logged-in Pessoa's slug, or `null` when the request has none. */
export const Owner = Context.Reference<string | null>(
  '@filmes/engine/runtime/Owner',
  { defaultValue: () => null },
)

/** The request's Dono: the logged-in Pessoa, or else the database's first
 * Pessoa with `dono = 1`, or `null` when there is none. */
export const ownerOf = (
  db: Connection,
): Effect.Effect<string | null, SqliteError> =>
  Effect.gen(function* () {
    const owner = yield* Owner
    if (owner !== null) return owner
    const row = yield* db.get(
      'SELECT slug FROM pessoas WHERE dono = 1 ORDER BY slug',
    )
    return row ? String(row['slug']) : null
  })
