// The diversity of a list (#171): the mean Parecença [similarity] of each
// pair of films in it, with the same similarity the Parecido filter uses
// (`similarity.ts`: genome, MovieLens tags, neighbours, genre and people).
// Lower is more diverse.
//
// The similarity is measured from a reference, so a pair counts the mean of
// both directions; a film the other has nothing in common with counts 0.
// Measuring a reference is the expensive part and the same films come back
// in many lists (each Pessoa, each set of the grid), so the pairs are kept
// for the whole evaluation. The grid never varies `[similar]`, so one
// config serves every set.

import { Effect } from 'effect'
import { measure, pairValue } from '../recommendation/similarity.ts'
import type { Weights } from '../runtime/Weights.ts'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'

/** The mean similarity of the pairs of a list, or `null` with fewer than
 * two films. */
export type ListSimilarity = (
  films: ReadonlyArray<string>,
) => Effect.Effect<number | null, SqliteError>

export const listSimilarity = (
  db: Connection,
  config: Weights['similar'],
): ListSimilarity => {
  /** `from → to` similarity, for the pairs measured so far. */
  const known = new Map<string, number>()
  const key = (from: string, to: string) => `${from}\0${to}`

  const oneWay = (from: string, others: ReadonlyArray<string>) =>
    Effect.gen(function* () {
      if (others.every((to) => known.has(key(from, to)))) return
      const pairs = yield* measure(db, from, config)
      for (const to of others) {
        const pair = pairs.get(to)
        known.set(key(from, to), pair ? pairValue(pair, config.weight) : 0)
      }
    })

  return (films) =>
    Effect.gen(function* () {
      if (films.length < 2) return null
      for (const film of films)
        yield* oneWay(
          film,
          films.filter((other) => other !== film),
        )
      let total = 0
      let pairs = 0
      for (const [i, a] of films.entries())
        for (const b of films.slice(i + 1)) {
          total += (known.get(key(a, b))! + known.get(key(b, a))!) / 2
          pairs += 1
        }
      return total / pairs
    })
}

/** The mean over the lists that have a similarity. */
export const meanSimilarity = (
  values: ReadonlyArray<number | null>,
): number | null => {
  const measured = values.filter((v): v is number => v !== null)
  return measured.length
    ? measured.reduce((a, b) => a + b, 0) / measured.length
    : null
}
