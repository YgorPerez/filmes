// `evaluate` on a copy of the database (#119's decision, moved into the
// engine for the MCP's `evaluate`, #110). The engine has no WAL, and
// `evaluate` holds one read transaction for its whole run (minutes on the
// whole MovieLens): on the live file, every write meanwhile (a Feedback, an
// import, a Pessoa) would fail as busy. So the run reads a copy made with
// SQLite's online backup, in a temporary folder removed when it ends. Only
// the database moves: the report folder, the Catalog and the sources'
// cache stay the process's.

import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'
import { Effect, Layer } from 'effect'
import type { EngineServices } from '../runtime/Engine.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import { Environment } from '../runtime/Environment.ts'
import type { Run } from '../runtime/Run.ts'
import { missingDatabase, Sqlite, SqliteError } from '../sqlite/Sqlite.ts'
import { evaluate, type EvaluateRequest, type Evaluation } from './evaluate.ts'

/** Copies `database` into `folder` with SQLite's online backup, which
 * waits for no writer and sees one consistent state. */
const backupTo = (database: string, folder: string) =>
  Effect.tryPromise({
    try: async () => {
      const copy = join(folder, 'filmes.sqlite')
      const source = new DatabaseSync(database, { readOnly: true })
      try {
        await backup(source, copy)
      } finally {
        source.close()
      }
      return copy
    },
    catch: (cause) =>
      new SqliteError({
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
      }),
  })

/** `evaluate(request)` reading a copy of the database: writes to the live
 * file go on while it measures. */
export const evaluateOnCopy = (
  request: EvaluateRequest = {},
): Effect.Effect<Evaluation, EngineError | SqliteError, EngineServices | Run> =>
  Effect.gen(function* () {
    const env = yield* Environment
    const database = yield* env.path('database')
    if (!existsSync(database)) return yield* missingDatabase(database)
    return yield* Effect.acquireUseRelease(
      Effect.sync(() => mkdtempSync(join(tmpdir(), 'filmes-evaluate-'))),
      (folder) =>
        Effect.gen(function* () {
          const copy = yield* backupTo(database, folder)
          const onCopy = Environment.of({
            ...env,
            paths: { ...env.paths, database: copy },
            path: (name) =>
              name === 'database' ? Effect.succeed(copy) : env.path(name),
          })
          return yield* evaluate(request).pipe(
            Effect.provide(
              // Fresh: the runtime memoizes `Sqlite.layer`, which would
              // give back the live database's service.
              Layer.fresh(Sqlite.layer).pipe(
                Layer.provide(Layer.succeed(Environment, onCopy)),
              ),
            ),
          )
        }),
      (folder) =>
        Effect.sync(() => rmSync(folder, { recursive: true, force: true })),
    )
  })
