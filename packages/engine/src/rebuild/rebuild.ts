// `reconstruir` (`banco/reconstrucao.py`): builds the database from nothing,
// the schema first, then the loading steps in order, into a temporary file
// next to `FILMES_BANCO`, and swaps it in at the end, so there is never a
// half-built database. The write lock is held throughout: a write that
// landed during the build would be lost by the swap.

import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import {
  basename,
  dirname,
  join,
  relative,
  resolve,
  isAbsolute,
} from 'node:path'
import { Effect } from 'effect'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { Environment } from '../runtime/Environment.ts'
import {
  Sqlite,
  withDatabaseFile,
  type Connection,
  type SqliteError,
} from '../sqlite/Sqlite.ts'
import { applySchema } from './schema.ts'
import { STEPS } from './steps/index.ts'

/** The code repository, which a database built from the real catalog must
 * stay out of (Python's `RAIZ`). */
export const REPOSITORY = resolve(import.meta.dirname, '../../../..')

export interface Rebuilt {
  /** The database's path, as configured. */
  readonly database: string
  /** Rows per table, by table name. */
  readonly tables: Readonly<Record<string, number>>
}

export const isInside = (path: string, folder: string): boolean => {
  const rest = relative(folder, path)
  return rest === '' || (!rest.startsWith('..') && !isAbsolute(rest))
}

/** Rows per table, in name order (`sqlite_*` left out). */
const countTables = (db: Connection) =>
  Effect.gen(function* () {
    const tables: Record<string, number> = {}
    const names = yield* db.all(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    for (const { name } of names) {
      const row = yield* db.get(`SELECT count(*) AS n FROM "${String(name)}"`)
      tables[String(name)] = Number(row?.['n'])
    }
    return tables
  })

const build = (db: Connection) =>
  Effect.gen(function* () {
    yield* applySchema(db)
    yield* db.exec('BEGIN')
    for (const step of STEPS) yield* step.load(db)
    yield* db.exec('COMMIT')
    return yield* countTables(db)
  })

export const rebuild: Effect.Effect<
  Rebuilt,
  EngineError | SqliteError,
  Environment | Sqlite
> = Effect.gen(function* () {
  const environment = yield* Environment
  const target = yield* environment.path('database')
  const catalog = yield* environment.path('catalog')
  if (
    !existsSync(join(catalog, 'filmes.csv')) &&
    isInside(resolve(target), REPOSITORY)
  )
    return yield* engineError(
      'invalid_config',
      'ponha FILMES_BANCO fora do repositório de código',
    )
  mkdirSync(dirname(resolve(target)), { recursive: true })
  const temporary = join(
    dirname(resolve(target)),
    `${basename(target)}.${randomBytes(6).toString('hex')}.novo`,
  )
  return yield* (yield* Sqlite).exclusive(
    Effect.acquireUseRelease(
      Effect.succeed(temporary),
      (file) =>
        Effect.gen(function* () {
          const tables = yield* withDatabaseFile(file, build)
          yield* Effect.sync(() => renameSync(file, target))
          return { database: target, tables }
        }),
      (file) => Effect.sync(() => rmSync(file, { force: true })),
    ),
  )
})
