// The query of a Pessoa's import page, for its two routes (Meu gosto's and
// another Pessoa's `importar`).
import {
  changesOf,
  countOf,
  isImportForm,
  isImportNotice,
  isImportRefusal,
} from './import-action'

/** The import page's query, as its routes keep it: what the last form
 * did (`feito`, with `novos`, `notas`, `vistos`, `mudaram`, `mudou`,
 * `iguais`, `lista` and `fora`) or why not (`erro`, with the form it came from in
 * `de`). */
export const importsSearch = (search: Record<string, unknown>) => ({
  feito: isImportNotice(search.feito) ? search.feito : undefined,
  erro: isImportRefusal(search.erro) ? search.erro : undefined,
  de: isImportForm(search.de) ? search.de : undefined,
  novos: countOf(search.novos),
  notas: countOf(search.notas),
  vistos: countOf(search.vistos),
  mudaram: countOf(search.mudaram),
  mudou: typeof search.mudou === 'string' ? search.mudou : undefined,
  iguais: countOf(search.iguais),
  lista: countOf(search.lista),
  fora: countOf(search.fora),
})

/** What the last form did, as the page shows it, from the query. */
export const doneOf = ({
  feito,
  novos,
  notas,
  vistos,
  mudaram,
  mudou,
  iguais,
  lista,
  fora,
}: ReturnType<typeof importsSearch>) =>
  feito && {
    notice: feito,
    facts: novos ?? 0,
    ratings: notas ?? 0,
    seen: vistos ?? 0,
    changed: mudaram ?? 0,
    changes: changesOf(mudou),
    repeated: iguais ?? 0,
    watchlist: lista ?? 0,
    outside: fora,
  }
