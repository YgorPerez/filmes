// `11_catalogo_real`: the catalog dumps pinned in the versions manifest
// (IMDb, Wikidata, GroupLens), read when the catalog folder has no
// `filmes.csv` (a folder of ready tables, the fixture's, goes through
// `20_tabelas_csv` instead).

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { loadCast } from '../../catalog/cast.ts'
import { loadGraph } from '../../catalog/graph.ts'
import { loadImdb } from '../../catalog/imdb.ts'
import { loadReview } from '../../catalog/review.ts'
import { readVersions, type Dumps } from '../../catalog/versions.ts'
import type { EngineError } from '../../runtime/EngineError.ts'
import { Environment } from '../../runtime/Environment.ts'
import type { Connection } from '../../sqlite/Sqlite.ts'
import type { Step } from './Step.ts'

/** The checked manifest of each rebuild, so `12_subgeneros` does not hash
 * the gigabytes of dumps a second time (Python read it twice). */
const checked = new WeakMap<Connection, Dumps>()

/** The pinned dumps, or `undefined` for a catalog of ready tables. */
export const pinnedDumps = (
  db: Connection,
): Effect.Effect<Dumps | undefined, EngineError, Environment> =>
  Effect.gen(function* () {
    const environment = yield* Environment
    const catalog = yield* environment.path('catalog')
    if (existsSync(join(catalog, 'filmes.csv'))) return undefined
    const known = checked.get(db)
    if (known !== undefined) return known
    const dumps = yield* readVersions(
      yield* environment.path('versions'),
      catalog,
    )
    checked.set(db, dumps)
    return dumps
  })

export const realCatalog: Step = {
  name: '11_catalogo_real',
  load: (db) =>
    Effect.gen(function* () {
      const dumps = yield* pinnedDumps(db)
      if (dumps === undefined) return
      const catalog = yield* (yield* Environment).path('catalog')
      yield* loadImdb(db, catalog, dumps)
      yield* loadGraph(db, catalog, dumps)
      yield* loadCast(db, catalog, dumps)
      yield* loadReview(db, catalog, dumps)
    }),
}
