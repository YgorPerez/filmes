// The derived SQLite database (`FILMES_BANCO`), through `node:sqlite`. The
// Python engine builds it and keeps its schema, so tables and columns keep
// their Portuguese names until reconstruct is ported (ADR 0004).
//
// - `read` opens a read-only connection for one use, like Python's
//   `abrir_leitura` (`mode=ro`).
// - `write` opens a read-write connection inside `BEGIN IMMEDIATE`, like
//   `sessao.escrita`, commits when the use succeeds and rolls back when it
//   fails. One write at a time per process: the lock is held for the whole
//   use, so a ticket that writes a Markdown file and syncs the database does
//   both inside the same `write` (#76, "a process per command becomes a
//   long-lived server").
//
// Both fail with `missing_database` when the file is not there, and both
// register the functions of `functions.ts`.

import { existsSync } from 'node:fs'
import {
  DatabaseSync,
  type SQLInputValue,
  type SQLOutputValue,
  type StatementSync,
} from 'node:sqlite'
import { Context, Effect, Layer, Schema, Semaphore } from 'effect'
import { Environment } from '../runtime/Environment.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { SQL_FUNCTIONS } from './functions.ts'

/** What SQLite itself refused: a bad query, a constraint, a busy database,
 * an action the authorizer denied. At an edge it is `internal`; a command
 * that runs SQL someone typed (`consultar`) catches it. */
export class SqliteError extends Schema.TaggedError<
  SqliteError,
  { readonly brand: unique symbol }
>()('SqliteError', { message: Schema.String, cause: Schema.Defect() }) {}

export type Row = Readonly<Record<string, SQLOutputValue>>

/** The database file is not there (Python `abrir_leitura`). */
export const missingDatabase = (path: string): EngineError =>
  engineError(
    'missing_database',
    `banco não encontrado em ${path}: rode \`python -m filmes reconstruir\``,
  )

export interface RunResult {
  readonly changes: number | bigint
  readonly lastInsertRowid: number | bigint
}

/** One open connection. Statements are prepared once per connection. */
export interface Connection {
  /** Every row. */
  readonly all: (
    sql: string,
    ...params: SQLInputValue[]
  ) => Effect.Effect<ReadonlyArray<Row>, SqliteError>
  /** The first row, or `undefined`. */
  readonly get: (
    sql: string,
    ...params: SQLInputValue[]
  ) => Effect.Effect<Row | undefined, SqliteError>
  /** The result columns' names, in order, even when there is no row. */
  readonly columns: (
    sql: string,
  ) => Effect.Effect<ReadonlyArray<string>, SqliteError>
  /** One statement that returns no rows. */
  readonly run: (
    sql: string,
    ...params: SQLInputValue[]
  ) => Effect.Effect<RunResult, SqliteError>
  /** Several statements, no parameters. */
  readonly exec: (sql: string) => Effect.Effect<void, SqliteError>
}

/** SQLite's authorizer callback: an action code (`constants.SQLITE_*` of
 * `node:sqlite`) and its arguments, answered with `SQLITE_OK`, `_DENY` or
 * `_IGNORE`. */
export type Authorizer = (
  action: number,
  arg1: string | null,
  arg2: string | null,
  database: string | null,
  trigger: string | null,
) => number

export interface ReadOptions {
  /** INTEGER columns as `bigint` (ids above 2^53, which otherwise throw). */
  readonly readBigInts?: boolean
  /** Checks every action of every statement prepared on the connection. */
  readonly authorizer?: Authorizer
}

/** How long a connection waits for another writer's lock, as Python's
 * `sqlite3.connect` default. */
const BUSY_TIMEOUT_MS = 5000

const fail = (cause: unknown): SqliteError =>
  new SqliteError({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  })

const makeConnection = (db: DatabaseSync): Connection => {
  const statements = new Map<string, StatementSync>()
  const prepare = (sql: string): StatementSync => {
    let statement = statements.get(sql)
    if (statement === undefined) {
      statement = db.prepare(sql)
      statements.set(sql, statement)
    }
    return statement
  }
  const attempt = <A>(f: () => A): Effect.Effect<A, SqliteError> =>
    Effect.try({ try: f, catch: fail })
  return {
    all: (sql, ...params) => attempt(() => prepare(sql).all(...params)),
    get: (sql, ...params) => attempt(() => prepare(sql).get(...params)),
    columns: (sql) =>
      attempt(() =>
        prepare(sql)
          .columns()
          .map((column) => column.name),
      ),
    run: (sql, ...params) => attempt(() => prepare(sql).run(...params)),
    exec: (sql) => attempt(() => db.exec(sql)),
  }
}

export class Sqlite extends Context.Service<
  Sqlite,
  {
    readonly read: <A, E, R>(
      use: (connection: Connection) => Effect.Effect<A, E, R>,
      options?: ReadOptions,
    ) => Effect.Effect<A, E | EngineError | SqliteError, R>
    readonly write: <A, E, R>(
      use: (connection: Connection) => Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E | EngineError | SqliteError, R>
  }
>()('@filmes/engine/sqlite/Sqlite') {
  static readonly layer: Layer.Layer<Sqlite, never, Environment> = Layer.effect(
    Sqlite,
    Effect.gen(function* () {
      const environment = yield* Environment
      const writeLock = yield* Semaphore.make(1)

      const open = (
        readOnly: boolean,
        options: ReadOptions = {},
      ): Effect.Effect<DatabaseSync, EngineError | SqliteError> =>
        Effect.flatMap(
          environment.path('database'),
          (path): Effect.Effect<DatabaseSync, EngineError | SqliteError> => {
            if (!existsSync(path)) return Effect.fail(missingDatabase(path))
            return Effect.try({
              try: () => {
                const db = new DatabaseSync(path, {
                  readOnly,
                  timeout: BUSY_TIMEOUT_MS,
                  readBigInts: options.readBigInts ?? false,
                })
                try {
                  for (const { name, fn } of SQL_FUNCTIONS)
                    db.function(name, { deterministic: true }, fn)
                  if (options.authorizer) db.setAuthorizer(options.authorizer)
                } catch (error) {
                  db.close()
                  throw error
                }
                return db
              },
              catch: fail,
            })
          },
        )

      const close = (db: DatabaseSync) =>
        Effect.sync(() => {
          if (db.isTransaction) db.exec('ROLLBACK')
          db.close()
        })

      return Sqlite.of({
        read: (use, options) =>
          Effect.acquireUseRelease(
            open(true, options),
            (db) => use(makeConnection(db)),
            close,
          ),
        write: (use) =>
          writeLock.withPermits(1)(
            Effect.acquireUseRelease(
              open(false),
              (db) => {
                const connection = makeConnection(db)
                return connection.exec('BEGIN IMMEDIATE').pipe(
                  Effect.andThen(() => use(connection)),
                  Effect.tap(() => connection.exec('COMMIT')),
                )
              },
              // A failed or interrupted use leaves the transaction open:
              // `close` rolls it back.
              close,
            ),
          ),
      })
    }),
  )
}
