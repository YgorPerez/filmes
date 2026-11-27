// The query of the queue page (Meu gosto's `fila`), for its route and the
// screen's tests.
import { searchParam } from './catalog-search'
import { countOf, isQueueNotice, isQueueRefusal } from './import-action'

/** A queued film's id or name as the query carries it. */
const textOf = (value: unknown) =>
  typeof value === 'string' && value.trim() !== ''
    ? value.trim().slice(0, 200)
    : undefined

/** The queue page's query, as its route keeps it: what the last decision
 * did (`feito`, with `resolvidos` and `restam`, and the film it was on,
 * `item` and `titulo`) or why not (`erro`); and the Catálogo search one
 * film's card asks (`buscar`, for the film `para`). */
export const queueSearch = (search: Record<string, unknown>) => ({
  feito: isQueueNotice(search.feito) ? search.feito : undefined,
  erro: isQueueRefusal(search.erro) ? search.erro : undefined,
  resolvidos: countOf(search.resolvidos),
  restam: countOf(search.restam),
  item: textOf(search.item),
  titulo: textOf(search.titulo),
  buscar: searchParam(search.buscar),
  para: textOf(search.para),
})
