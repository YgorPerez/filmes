// `consultar`: one read-only SQL query on the derived database, for the
// Dono and the admin tools (`filmes/comandos/consultar.py`). The database
// opens read-only and an authorizer lets only reading through, so a write
// fails `read_only` before it runs.
//
// The result is JSON for the MCP and the web app: an integer beyond 2^53
// comes as a string (JavaScript would round it), and a BLOB as its SQLite
// literal, `X'0A1B'` (Python could not print one at all).

import { constants, type SQLOutputValue } from 'node:sqlite'
import { Effect } from 'effect'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { Sqlite, SqliteError } from '../sqlite/Sqlite.ts'

/** What the authorizer lets through: reading, functions, recursive CTEs. */
const ALLOWED: ReadonlySet<number> = new Set([
  constants.SQLITE_SELECT,
  constants.SQLITE_READ,
  constants.SQLITE_FUNCTION,
  constants.SQLITE_RECURSIVE,
])

export type ConsultValue = string | number | null

export interface ConsultResult {
  readonly columns: ReadonlyArray<string>
  readonly rows: ReadonlyArray<ReadonlyArray<ConsultValue>>
}

/** Python's `str(sqlite3.Error)` is SQLite's own message, as node's. */
const invalidSql = (error: SqliteError): EngineError =>
  engineError('invalid_sql', error.message)

const toJson = (value: SQLOutputValue): ConsultValue => {
  if (typeof value === 'bigint')
    return Number.isSafeInteger(Number(value)) ? Number(value) : String(value)
  if (value instanceof Uint8Array)
    return `X'${Buffer.from(value).toString('hex').toUpperCase()}'`
  return value
}

/** Runs `sql`, one statement, and gives its columns and rows. */
export const consult = (
  sql: string,
): Effect.Effect<ConsultResult, EngineError, Sqlite> =>
  Effect.gen(function* () {
    const sqlite = yield* Sqlite
    const denied: number[] = []
    const authorizer = (action: number) => {
      if (ALLOWED.has(action)) return constants.SQLITE_OK
      denied.push(action)
      return constants.SQLITE_DENY
    }
    return yield* sqlite
      .read(
        (db) =>
          Effect.gen(function* () {
            const statement = yield* db.prepareTyped(sql)
            if (statement === undefined) return { columns: [], rows: [] }
            if (hasStatement(statement.tail))
              return yield* engineError(
                'invalid_sql',
                'You can only execute one statement at a time.',
              )
            if (statement.parameterCount > 0)
              return yield* engineError(
                'invalid_sql',
                `Incorrect number of bindings supplied. The current statement uses ${statement.parameterCount}, and there are 0 supplied.`,
              )
            const rows = yield* statement.rows
            return {
              columns: statement.columns,
              rows: rows.map((row) => row.map(toJson)),
            }
          }),
        { readBigInts: true, authorizer },
      )
      .pipe(
        Effect.catchTag('SqliteError', (error) =>
          Effect.fail(
            denied.length > 0
              ? engineError('read_only', 'consultar só aceita leitura (SELECT)')
              : invalidSql(error),
          ),
        ),
      )
  })

/** Whether a statement's tail holds more than blanks and comments, as
 * Python's `lstrip_sql` (an unterminated comment runs to the end). */
function hasStatement(tail: string): boolean {
  let i = 0
  while (i < tail.length) {
    const c = tail[i]
    if (c === ' ' || c === '\t' || c === '\f' || c === '\n' || c === '\r') i++
    else if (c === '-' && tail[i + 1] === '-') {
      const end = tail.indexOf('\n', i + 2)
      if (end === -1) return false
      i = end + 1
    } else if (c === '/' && tail[i + 1] === '*') {
      const end = tail.indexOf('*/', i + 2)
      if (end === -1) return false
      i = end + 2
    } else return true
  }
  return false
}
