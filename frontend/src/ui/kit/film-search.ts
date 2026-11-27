// The Catálogo search the page runs as the Dono types (#235): the server
// function of the pages' `?buscar=`.

import { searchFor, type CatalogScope } from '#/content/catalog-search'
import type { SearchAnswer } from '#/platform/catalog-search'

export type { CatalogScope, SearchAnswer }

/** The films of the Catálogo whose title or id is `text`. */
export const searchFilms = (text: string): Promise<SearchAnswer | null> =>
  searchFor(text, 'films')

/** What of the Catálogo has `text` in its name, in `scope`: films, or
 * films and the people, genres and series (a Pessoa's targets, #273). */
export const searchCatalog = (
  text: string,
  scope: CatalogScope,
): Promise<SearchAnswer | null> => searchFor(text, scope)
