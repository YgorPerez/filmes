// Today's engine `Sqlite` (node:sqlite), with each statement timed: the
// same seam `duck-sqlite.ts` fills, so both sides count SQL the same way.
import { Effect, Layer } from 'effect'
import {
  Sqlite,
  type Connection,
} from '../../packages/engine/src/sqlite/Sqlite.ts'
import { timing } from './timing.ts'

const timed = (c: Connection): Connection => {
  const wrap =
    <K extends 'all' | 'get' | 'run'>(k: K) =>
    (sql: string, ...params: never[]) =>
      Effect.suspend(() => {
        const start = performance.now()
        let rows = 0
        return (c[k] as (s: string, ...p: never[]) => Effect.Effect<unknown, never>)(sql, ...params).pipe(
          Effect.tap((r) => Effect.sync(() => (rows = Array.isArray(r) ? r.length : r === undefined ? 0 : 1))),
          Effect.ensuring(Effect.sync(() => timing.add(sql, performance.now() - start, rows))),
        )
      })
  return { ...c, all: wrap('all'), get: wrap('get'), run: wrap('run') } as Connection
}

export const timedSqliteLayer = Layer.effect(
  Sqlite,
  Effect.map(Sqlite, (inner) =>
    Sqlite.of({
      ...inner,
      read: (use, options) => inner.read((c) => use(timed(c)), options),
    }),
  ),
).pipe(Layer.provide(Sqlite.layer))
