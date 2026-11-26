// Diversidade [diversity] in the final order (#177): MMR (Carbonell and
// Goldstein, 1998). Each next place goes to the film with the largest
//
//     λ × score − (1 − λ) × the largest Parecença to a film already chosen
//
// where the score is the first value of the Regra de escolha plus the
// film's bonuses, and the Parecença is the `--parecido` one, measured from
// the film already chosen (it is the reference, as in "parecido com X").
// The band (some utility, film signals only, guesses only) still comes
// first, and a tie keeps the order by the Regra; with λ = 1 nothing moves.
//
// Only the first `depth` places are chosen this way, among the first `pool`
// films of the order, and the Parecença is measured only among those: each
// chosen film is one `measure` limited to the pool. The places after
// `depth` follow the Regra. When regenerating, the kept films are already
// chosen: a new film too like one of them goes down too.

import { Effect } from 'effect'
import type { Weights } from '../runtime/Weights.ts'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'
import { similarityTo } from './similarity.ts'

/** A film of the order, as MMR reads it. */
export interface Scored {
  readonly id: string
  /** 0 with some known utility, 1 with film signals only, 2 with guesses
   * only. */
  readonly band: number
  /** The Regra's first value plus the film's bonuses; larger is better. */
  readonly score: number
}

/** `ordered` (by the Regra, best first) with its first `places` chosen by
 * MMR, after the films in `chosen`. */
export const diversify = <A extends Scored>(
  db: Connection,
  ordered: ReadonlyArray<A>,
  chosen: ReadonlyArray<Pick<Scored, 'id'>>,
  places: number,
  weights: Pick<Weights, 'diversity' | 'similar'>,
): Effect.Effect<ReadonlyArray<A>, SqliteError> =>
  Effect.gen(function* () {
    const { lambda, depth, pool: size } = weights.diversity
    const picks = Math.min(places, depth)
    if (lambda >= 1 || picks < 1) return ordered
    const pool = ordered.slice(0, size)
    const among = pool.map((item) => item.id)
    /** Film → its largest Parecença to a film already chosen. */
    const closest = new Map<string, number>()
    const choose = (reference: string) =>
      Effect.gen(function* () {
        for (const [id, value] of yield* similarityTo(
          db,
          reference,
          among,
          weights.similar,
        ))
          closest.set(id, Math.max(closest.get(id) ?? 0, value))
      })
    for (const { id } of chosen) yield* choose(id)

    const value = (item: A) =>
      lambda * item.score - (1 - lambda) * (closest.get(item.id) ?? 0)
    const left = [...pool]
    const picked: A[] = []
    while (picked.length < picks && left.length > 0) {
      let best = 0
      for (const [i, item] of left.entries()) {
        const leader = left[best]!
        if (
          item.band < leader.band ||
          (item.band === leader.band && value(item) > value(leader))
        )
          best = i
      }
      const [item] = left.splice(best, 1)
      picked.push(item!)
      if (picked.length < picks) yield* choose(item!.id)
    }
    return [...picked, ...left, ...ordered.slice(size)]
  })
