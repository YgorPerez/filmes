// `12_subgeneros`: the Wikidata genre hierarchy (P279), so a Veto on a
// genre reaches its subgenres. Only for a catalog of dumps.

import { Effect } from 'effect'
import { loadSubgenres } from '../../catalog/subgenres.ts'
import { Environment } from '../../runtime/Environment.ts'
import { pinnedDumps } from './real-catalog.ts'
import type { Step } from './Step.ts'

export const subgenres: Step = {
  name: '12_subgeneros',
  load: (db) =>
    Effect.gen(function* () {
      const dumps = yield* pinnedDumps(db)
      if (dumps === undefined) return
      yield* loadSubgenres(
        db,
        yield* (yield* Environment).path('catalog'),
        dumps,
      )
    }),
}
