// The on-demand sources' answers, with an expiry, in a SQLite file of their
// own (`filmes/sob_demanda/cache.py`). It lives outside the derived database:
// `reconstruir` and the blue/green swap replace that file, and must not drop
// what took API calls to gather. The file is `FILMES_CACHE` or, without it,
// `<database stem>-cache.sqlite` beside the database.
//
// Same table, same keys and same dates as the Python, so either engine reads
// what the other wrote (the oracle hands both a copy of one cache). One
// connection per process, opened on first use, in WAL mode with a busy
// timeout: the server's requests share it, and another process (the Python
// CLI, a second app instance) may write the same file.

import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { Context, Effect, Layer } from 'effect'
import { Environment } from '../runtime/Environment.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import { SqliteError } from '../sqlite/Sqlite.ts'

// The Python's text, comments included: SQLite keeps it in `sqlite_master`.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS respostas (
    fonte     TEXT NOT NULL,
    chave     TEXT NOT NULL,
    corpo     TEXT NOT NULL,                -- JSON da resposta, como veio
    obtido_em TEXT NOT NULL,                -- AAAA-MM-DD
    expira_em TEXT NOT NULL,                -- vale enquanto hoje < expira_em
    PRIMARY KEY (fonte, chave)
)
`

/** How long a write waits for another process's lock. */
const BUSY_TIMEOUT_MS = 5000

/** One answer as the cache keeps it. */
export interface CachedAnswer {
  /** The JSON the source answered, as it came (a "not found" included). */
  readonly body: unknown
  /** `YYYY-MM-DD`: the day it was fetched. */
  readonly fetchedOn: string
}

type CacheError = EngineError | SqliteError

/** `iso` plus `days`, as `YYYY-MM-DD`. */
const addDays = (iso: string, days: number): string => {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const fail = (cause: unknown): SqliteError =>
  new SqliteError({
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  })

export class SourceCache extends Context.Service<
  SourceCache,
  {
    /** The answer of `source` for `key` that is still valid `today`. */
    readonly read: (
      source: string,
      key: string,
      today: string,
    ) => Effect.Effect<CachedAnswer | undefined, CacheError>
    /** `read`, without creating the file when there is none (the import
     * queue only looks at what an earlier import fetched). */
    readonly peek: (
      source: string,
      key: string,
      today: string,
    ) => Effect.Effect<CachedAnswer | undefined, CacheError>
    /** Keeps `body`, valid while today is before `today + validityDays`. */
    readonly write: (
      source: string,
      key: string,
      body: unknown,
      today: string,
      validityDays: number,
    ) => Effect.Effect<CachedAnswer, CacheError>
  }
>()('@filmes/engine/sources/SourceCache') {
  static readonly layer: Layer.Layer<SourceCache, never, Environment> =
    Layer.effect(
      SourceCache,
      Effect.gen(function* () {
        const environment = yield* Environment
        let db: DatabaseSync | undefined
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            db?.close()
            db = undefined
          }),
        )

        /** The connection, opened (and the file created) on first use. */
        const open: Effect.Effect<DatabaseSync, CacheError> = Effect.suspend(
          () =>
            db !== undefined
              ? Effect.succeed(db)
              : Effect.flatMap(environment.path('cache'), (path) =>
                  Effect.try({
                    try: () => {
                      mkdirSync(dirname(path), { recursive: true })
                      const opened = new DatabaseSync(path, {
                        timeout: BUSY_TIMEOUT_MS,
                      })
                      try {
                        opened.exec('PRAGMA journal_mode = WAL')
                        opened.exec(SCHEMA)
                      } catch (error) {
                        opened.close()
                        throw error
                      }
                      db = opened
                      return opened
                    },
                    catch: fail,
                  }),
                ),
        )

        /** The connection when the file is there; never creates it. */
        const openExisting: Effect.Effect<
          DatabaseSync | undefined,
          CacheError
        > = Effect.suspend(() =>
          db !== undefined
            ? Effect.succeed(db)
            : Effect.flatMap(environment.path('cache'), (path) =>
                existsSync(path) ? open : Effect.undefined,
              ),
        )

        const readFrom =
          (connection: Effect.Effect<DatabaseSync | undefined, CacheError>) =>
          (source: string, key: string, today: string) =>
            Effect.flatMap(connection, (opened) =>
              opened === undefined
                ? Effect.undefined
                : Effect.try({
                    try: (): CachedAnswer | undefined => {
                      const row = opened
                        .prepare(
                          'SELECT corpo, obtido_em FROM respostas WHERE fonte = ? AND chave = ? AND expira_em > ?',
                        )
                        .get(source, key, today)
                      return row === undefined
                        ? undefined
                        : {
                            body: JSON.parse(String(row['corpo'])),
                            fetchedOn: String(row['obtido_em']),
                          }
                    },
                    catch: fail,
                  }),
            )

        return SourceCache.of({
          read: readFrom(open),
          peek: readFrom(openExisting),
          write: (source, key, body, today, validityDays) =>
            Effect.flatMap(open, (opened) =>
              Effect.try({
                try: (): CachedAnswer => {
                  opened
                    .prepare(
                      'INSERT OR REPLACE INTO respostas (fonte, chave, corpo, obtido_em, expira_em) VALUES (?, ?, ?, ?, ?)',
                    )
                    .run(
                      source,
                      key,
                      JSON.stringify(body),
                      today,
                      addDays(today, validityDays),
                    )
                  return { body, fetchedOn: today }
                },
                catch: fail,
              }),
            ),
        })
      }),
    )
}
