// The query of the queue page (Meu gosto's `fila`), for its route and the
// screen's tests.
import { countOf, isQueueNotice, isQueueRefusal } from './import-action'

/** The queue page's query, as its route keeps it: what the last decision
 * did (`feito`, with `resolvidos` and `restam`) or why not (`erro`). */
export const queueSearch = (search: Record<string, unknown>) => ({
  feito: isQueueNotice(search.feito) ? search.feito : undefined,
  erro: isQueueRefusal(search.erro) ? search.erro : undefined,
  resolvidos: countOf(search.resolvidos),
  restam: countOf(search.restam),
})
