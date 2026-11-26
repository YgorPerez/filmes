// The Leitura do pedido as a page says it (#184): Nova Sessão's "Ler" and
// the Cartaz's Acrescentar show the same thing. Server only.

import type { ReadCandidate, ReadField, RequestReading } from '@filmes/engine'

/** What a reading understood, what it did not, and what it could not
 * decide. */
export type PageReading = {
  /** Each item as the page says it ("Presente: Iara"). */
  readonly understood: readonly string[]
  /** Each run of words it did not understand, as typed. */
  readonly notUnderstood: readonly string[]
  /** A name of several Pessoas, or a title of several films or of none. */
  readonly ambiguities: ReadonlyArray<{
    readonly field: ReadField
    readonly words: string
    readonly candidates: readonly ReadCandidate[]
  }>
}

export const pageReading = (reading: RequestReading): PageReading => ({
  understood: reading.understood.map((item) => item.label),
  notUnderstood: [...reading.notUnderstood],
  ambiguities: reading.ambiguities.map(({ field, words, candidates }) => ({
    field,
    words,
    candidates: candidates.map(({ id, label }) => ({ id, label })),
  })),
})
