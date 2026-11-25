import { createServerFn } from '@tanstack/react-start'
import { ownerMiddleware, requireOwner } from './owner'

/** What a Catálogo search field may look for: films only (Parecido com,
 * Outro filme), or films and the entities a Declarado, Veto or Ajuste
 * targets (the Pessoa's page). */
export type CatalogScope = 'films' | 'all'

/** The search a page's `?buscar=` asks for: the text, trimmed, or
 * undefined when there is none. */
export const searchParam = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() !== ''
    ? value.trim().slice(0, 200)
    : undefined

/** The films "Parecido com" already took (`?parecido=tt1,tt2`): only IMDb
 * ids, each once, in order. */
export const similarParam = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const ids = [...new Set(value.split(',').map((id) => id.trim()))].filter(
    (id) => /^tt\d+$/.test(id),
  )
  return ids.length === 0 ? undefined : ids.join(',')
}

/** One film's IMDb id from the query (`?filme=tt…`). */
export const filmParam = (value: unknown): string | undefined =>
  typeof value === 'string' && /^tt\d+$/.test(value) ? value : undefined

/** The Catálogo search of a page's `?buscar=` (`catalogSearch`). */
const readCatalogSearch = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .validator((value: unknown) => {
    const { query, scope } = (value ?? {}) as Record<string, unknown>
    const text = searchParam(query)
    if (text === undefined) throw new Error('query required')
    return { query: text, scope: scope === 'films' ? 'films' : 'all' } as const
  })
  .handler(async ({ context, data }) => {
    requireOwner(context.owner)
    const { appCatalogSearch } = await import('#/platform/people')
    return appCatalogSearch(data.query, data.scope)
  })

/** The search for a page's loader: none without `?buscar=`. */
export const searchFor = (query: string | undefined, scope: CatalogScope) =>
  query === undefined
    ? Promise.resolve(null)
    : readCatalogSearch({ data: { query, scope } })
