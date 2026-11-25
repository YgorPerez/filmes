// The Catálogo search of the screens that take IDs (#128): the Pessoa's
// page, "Parecido com" in Nova Sessão and "Outro filme" in Feedback. A
// plain GET (`?buscar=`), so it works before the JavaScript. Server only.
// The app's search (`appCatalogSearch`) is in `people.ts`, whose module
// already has the engine: `engine.ts` is at fallow's coupling limit.

import {
  searchCatalog,
  type CatalogSearch,
  type Engine,
  type Outcome,
} from '@filmes/engine'
import type { CatalogScope } from '#/content/catalog-search'

/** Why there is no result list: the query is too short for the engine, or
 * the engine cannot run here. */
export type SearchRefusal = 'curta' | 'indisponivel'

export type SearchAnswer =
  | { readonly query: string; readonly found: CatalogSearch }
  | { readonly query: string; readonly refused: SearchRefusal }

/** Searches as the screen's scope asks: films only, or every kind. */
export async function catalogSearch(
  run: Engine['run'],
  query: string,
  scope: CatalogScope,
): Promise<SearchAnswer> {
  const outcome: Outcome<CatalogSearch> = await run(
    searchCatalog({ query, ...(scope === 'films' && { kinds: ['film'] }) }),
  )
  if (outcome.exitCode === 0) return { query, found: outcome.output }
  const { code, message } = outcome.output.error
  if (code === 'invalid_usage') return { query, refused: 'curta' }
  console.error(`engine: ${code}: ${message}`)
  return { query, refused: 'indisponivel' }
}
