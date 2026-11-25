// A `Sqlite` service on DuckDB, for the #124 measurement only: the same
// `Connection` interface the engine reads through, so `recommend` runs the
// same TypeScript on both databases and only the SQL engine changes.
//
// The SQL is the engine's, rewritten on the fly where DuckDB's dialect
// differs (see `translate`). Only `read` is real: `recommend` never writes.

import { Effect, Layer, Semaphore } from 'effect'
import {
  DuckDBInstance,
  type DuckDBConnection,
  type DuckDBPreparedStatement,
} from '@duckdb/node-api'
import {
  Sqlite,
  SqliteError,
  type Connection,
  type Row,
} from '../../packages/engine/src/sqlite/Sqlite.ts'
import { timing } from './timing.ts'

const fail = (cause: unknown): SqliteError =>
  new SqliteError({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  })

/** SQLite's dialect → DuckDB's, for the statements `recommend` runs:
 * - `IN (SELECT value FROM json_each(?))` → a VARCHAR list unnested;
 * - `?N` → `$N` (DuckDB takes `$N`; a statement mixing both is not used);
 * - plain `?` → `$k`, numbered, so the two forms never mix. */
export function translate(sql: string): string {
  let out = sql.replace(
    /SELECT value FROM json_each\((\?\d*)\)/g,
    (_, p: string) => `SELECT unnest(from_json(${p}, '["VARCHAR"]'))`,
  )
  if (/\?\d/.test(out)) out = out.replace(/\?(\d+)/g, '$$$1')
  else {
    let k = 0
    out = out.replace(/\?/g, () => `$${++k}`)
  }
  return out
}

const bindAll = (
  statement: DuckDBPreparedStatement,
  params: ReadonlyArray<unknown>,
) => {
  statement.clearBindings()
  const count = statement.parameterCount
  for (let i = 0; i < count; i++) {
    const value = params[i]
    const at = i + 1
    if (value === null || value === undefined) statement.bindNull(at)
    else if (typeof value === 'string') statement.bindVarchar(at, value)
    else if (typeof value === 'bigint') statement.bindBigInt(at, value)
    else if (typeof value === 'number')
      if (Number.isInteger(value)) statement.bindBigInt(at, BigInt(value))
      else statement.bindDouble(at, value)
    else if (typeof value === 'boolean') statement.bindBoolean(at, value)
    else throw new TypeError(`unsupported parameter ${typeof value}`)
  }
}

const toRow = (row: Record<string, unknown>): Row => {
  const out: Record<string, unknown> = {}
  for (const key in row) {
    const v = row[key]
    out[key] = typeof v === 'bigint' ? Number(v) : v
  }
  return out as Row
}

const makeConnection = (db: DuckDBConnection): Connection => {
  const statements = new Map<string, Promise<DuckDBPreparedStatement>>()
  const prepare = (sql: string) => {
    let s = statements.get(sql)
    if (s === undefined) {
      s = db.prepare(translate(sql))
      statements.set(sql, s)
    }
    return s
  }
  const query = (sql: string, params: ReadonlyArray<unknown>) =>
    Effect.tryPromise({
      try: async () => {
        const start = performance.now()
        let rows = 0
        try {
          const statement = await prepare(sql)
          bindAll(statement, params)
          const reader = await statement.runAndReadAll()
          const out = reader.getRowObjectsJS().map(toRow)
          rows = out.length
          return out
        } finally {
          timing.add(sql, performance.now() - start, rows)
        }
      },
      catch: fail,
    })
  const unsupported = (what: string) =>
    Effect.fail(fail(new Error(`${what}: not in the DuckDB prototype`)))
  return {
    all: (sql, ...params) => query(sql, params),
    get: (sql, ...params) => Effect.map(query(sql, params), (rows) => rows[0]),
    columns: () => unsupported('columns'),
    run: () => unsupported('run'),
    runMany: () => unsupported('runMany'),
    exec: () => unsupported('exec'),
    prepareTyped: () => unsupported('prepareTyped'),
  }
}

export interface DuckOptions {
  readonly path: string
  readonly threads: number
  readonly tempDirectory: string
}

/** One read-only DuckDB instance per process, a connection per `read`. */
export const duckSqliteLayer = (options: DuckOptions) =>
  Layer.effect(
    Sqlite,
    Effect.gen(function* () {
      const instance = yield* Effect.promise(() =>
        DuckDBInstance.create(options.path, {
          access_mode: 'READ_ONLY',
          memory_limit: '1GB',
          threads: String(options.threads),
          temp_directory: options.tempDirectory,
          // SQLite sorts NULL as the smallest value.
          default_null_order: 'nulls_first_on_asc_last_on_desc',
        }),
      )
      yield* Effect.addFinalizer(() => Effect.sync(() => instance.closeSync()))
      const lock = yield* Semaphore.make(1)
      return Sqlite.of({
        read: (use) =>
          Effect.acquireUseRelease(
            Effect.promise(() => instance.connect()),
            (db) => use(makeConnection(db)),
            (db) => Effect.sync(() => db.closeSync()),
          ),
        write: () => Effect.die(new Error('write: not in the DuckDB prototype')),
        exclusive: (effect) => lock.withPermits(1)(effect),
      })
    }),
  )
