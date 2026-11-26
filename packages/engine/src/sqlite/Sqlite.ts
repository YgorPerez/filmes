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
//
// The database is in WAL mode (#125): readers never block the writer, so
// `evaluate`'s one read transaction of minutes leaves Feedback and imports
// alone. `rebuild` leaves its file in WAL, and `write` switches a file built
// before that (the mode is kept in the file). The `-wal` and `-shm` beside
// the file belong to it: a copy of the file alone may miss committed pages.

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

/** The database file is not there. */
export const missingDatabase = (path: string): EngineError =>
  engineError(
    'missing_database',
    `banco não encontrado em ${path}: rode \`pnpm db:publish --build\``,
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
  /** One statement run once per row, as Python's `executemany`. A row
   * source that throws is a defect, not a `SqliteError`. */
  readonly runMany: (
    sql: string,
    rows: Iterable<ReadonlyArray<SQLInputValue>>,
  ) => Effect.Effect<void, SqliteError>
  /** Several statements, no parameters. */
  readonly exec: (sql: string) => Effect.Effect<void, SqliteError>
  /** The first statement of a text someone typed (`consultar`), prepared
   * on its own; `undefined` when the text has none (blanks, comments, `;`). */
  readonly prepareTyped: (
    sql: string,
  ) => Effect.Effect<TypedStatement | undefined, SqliteError>
}

/** A statement someone typed, as Python's `sqlite3` sees it before running
 * it: SQLite prepares only the first statement of a text. */
export interface TypedStatement {
  /** The result columns' names, in order, a repeated name kept. */
  readonly columns: ReadonlyArray<string>
  /** The text after the first statement, which SQLite left unprepared. */
  readonly tail: string
  /** How many parameters it takes (`sqlite3_bind_parameter_count`). */
  readonly parameterCount: number
  /** Runs it with no parameter: every row, as an array in column order. */
  readonly rows: Effect.Effect<
    ReadonlyArray<ReadonlyArray<SQLOutputValue>>,
    SqliteError
  >
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
    runMany: (sql, rows) =>
      Effect.suspend(() => {
        let statement: StatementSync
        try {
          statement = prepare(sql)
        } catch (error) {
          return Effect.fail(fail(error))
        }
        for (const row of rows)
          try {
            statement.run(...row)
          } catch (error) {
            return Effect.fail(fail(error))
          }
        return Effect.void
      }),
    exec: (sql) => attempt(() => db.exec(sql)),
    prepareTyped: (sql) =>
      attempt(() => {
        let statement: StatementSync
        try {
          statement = db.prepare(sql)
        } catch (error) {
          // node:sqlite's own refusal of a text with no statement, where
          // SQLite gives no statement and no error.
          if (isNoStatement(error)) return undefined
          throw error
        }
        statement.setReturnArrays(true)
        const source = statement.sourceSQL
        return {
          columns: statement.columns().map((column) => column.name),
          tail: sql.slice(source.length),
          // Without parameters SQLite expands the text verbatim.
          parameterCount:
            statement.expandedSQL === source ? 0 : parameterCount(source),
          rows: attempt(
            () =>
              statement.all() as unknown as ReadonlyArray<
                ReadonlyArray<SQLOutputValue>
              >,
          ),
        }
      }),
  }
}

const isNoStatement = (error: unknown): boolean =>
  error instanceof Error &&
  'code' in error &&
  error.code === 'ERR_INVALID_ARG_VALUE'

/** SQLite's identifier characters (`IdChar`): ASCII letters, digits, `_`,
 * `$`, and anything past ASCII. */
const isIdChar = (c: string | undefined): boolean =>
  c !== undefined && (/[\w$]/.test(c) || c.charCodeAt(0) > 0x7f)

const skipPast = (sql: string, from: number, end: string): number => {
  const at = sql.indexOf(end, from)
  return at === -1 ? sql.length : at + end.length
}

/** `sqlite3_bind_parameter_count` of one statement SQLite already accepted,
 * which node:sqlite does not expose: the parser's numbering, from SQLite's
 * tokenizer. `?` takes the next number, `?NNN` the number NNN, and a name
 * (`:a`, `@a`, `$a`) the next number the first time it shows up. */
function parameterCount(sql: string): number {
  let count = 0
  const names = new Set<string>()
  let i = 0
  while (i < sql.length) {
    const c = sql[i] as string
    if (c === "'" || c === '"' || c === '`') {
      // A quote ends the string unless doubled.
      let j = i + 1
      while (j < sql.length && !(sql[j] === c && sql[j + 1] !== c))
        j += sql[j] === c ? 2 : 1
      i = j + 1
    } else if (c === '[') i = skipPast(sql, i + 1, ']')
    else if (c === '-' && sql[i + 1] === '-') i = skipPast(sql, i + 2, '\n')
    else if (c === '/' && sql[i + 1] === '*') i = skipPast(sql, i + 2, '*/')
    else if (c === '?') {
      let j = i + 1
      while (j < sql.length && /[0-9]/.test(sql[j] as string)) j++
      count =
        j > i + 1 ? Math.max(count, Number(sql.slice(i + 1, j))) : count + 1
      i = j
    } else if (c === ':' || c === '@' || c === '$' || c === '#') {
      let j = i + 1
      while (isIdChar(sql[j]) || (c === '$' && sql.startsWith('::', j)))
        j += sql.startsWith('::', j) ? 2 : 1
      // Tcl's `$a(index)`.
      if (c === '$' && j > i + 1 && sql[j] === '(') j = skipPast(sql, j, ')')
      const name = sql.slice(i, j)
      if (j > i + 1 && !names.has(name)) {
        names.add(name)
        count++
      }
      i = Math.max(j, i + 1)
    } else if (isIdChar(c)) {
      let j = i + 1
      while (isIdChar(sql[j])) j++
      i = j
    } else i++
  }
  return count
}

/** Opens a file with the functions of `functions.ts` (and the authorizer)
 * registered; SQLite creates it when missing and writable. */
const openFile = (
  path: string,
  readOnly: boolean,
  options: ReadOptions = {},
): Effect.Effect<DatabaseSync, SqliteError> =>
  Effect.try({
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

/** Switches a database built in rollback mode to WAL; a no-op once it is.
 * Another connection reading at that moment makes the switch wait for the
 * busy timeout and then refuse: the write goes on, and a later one
 * switches. */
const toWal = (connection: Connection) =>
  Effect.ignore(connection.exec('PRAGMA journal_mode = WAL'))

/** Closes a connection, rolling back a transaction a failed or interrupted
 * use left open. */
const close = (db: DatabaseSync) =>
  Effect.sync(() => {
    if (db.isTransaction) db.exec('ROLLBACK')
    db.close()
  })

/** A read-write connection to a file of one's own, outside `FILMES_BANCO`
 * and outside the write lock: the file a rebuild fills before it swaps it
 * in. SQLite creates the file when it is missing. No transaction is opened;
 * the use runs its own. */
export const withDatabaseFile = <A, E, R>(
  path: string,
  use: (connection: Connection) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E | SqliteError, R> =>
  Effect.acquireUseRelease(
    openFile(path, false),
    (db) => use(makeConnection(db)),
    close,
  )

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
    /** Runs `effect` holding the write lock, with no connection: a write
     * to filmes-dados when there is no database file to sync. */
    readonly exclusive: <A, E, R>(
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E, R>
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
            return openFile(path, readOnly, options)
          },
        )

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
                return toWal(connection).pipe(
                  Effect.andThen(() => connection.exec('BEGIN IMMEDIATE')),
                  Effect.andThen(() => use(connection)),
                  Effect.tap(() => connection.exec('COMMIT')),
                )
              },
              // A failed or interrupted use leaves the transaction open:
              // `close` rolls it back.
              close,
            ),
          ),
        exclusive: (effect) => writeLock.withPermits(1)(effect),
      })
    }),
  )
}
