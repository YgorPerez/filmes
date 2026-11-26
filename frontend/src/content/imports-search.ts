// The query of a Pessoa's import page, for its two routes (Meu gosto's and
// another Pessoa's `importar`).
import { countOf, isImportNotice, isImportRefusal } from './import-action'

/** The import page's query, as its routes keep it: what the last form
 * did (`feito`, with `novos` and `fora`) or why not (`erro`). */
export const importsSearch = (search: Record<string, unknown>) => ({
  feito: isImportNotice(search.feito) ? search.feito : undefined,
  erro: isImportRefusal(search.erro) ? search.erro : undefined,
  novos: countOf(search.novos),
  fora: countOf(search.fora),
})
