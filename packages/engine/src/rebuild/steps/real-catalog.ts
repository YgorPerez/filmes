// `11_catalogo_real` and `12_subgeneros`: the catalog dumps (IMDb, Wikidata,
// GroupLens), read when the catalog folder has no `filmes.csv`. The ingestion
// of the dumps is #106; until then a rebuild takes only a folder of ready
// tables (the fixture's).

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { engineError } from '../../runtime/EngineError.ts'
import { Environment } from '../../runtime/Environment.ts'
import type { Step } from './Step.ts'

export const realCatalog: Step = {
  name: '11_catalogo_real',
  load: () =>
    Effect.gen(function* () {
      const catalog = yield* (yield* Environment).path('catalog')
      if (existsSync(join(catalog, 'filmes.csv'))) return
      return yield* engineError(
        'missing_catalog',
        `${join(catalog, 'filmes.csv')} não encontrado: o motor em TypeScript ainda não lê os dumps do catálogo`,
      )
    }),
}
