// Vizinhos de gosto [taste neighbours] (#174): what the MovieLens users
// closest to the Pessoa gave each Candidate (`../taste-neighbors.ts`).
//
// One review Evidence per Candidate that enough neighbours rated: "23
// pessoas de gosto parecido deram 4,3 em média a este". Its base is
// `[taste_neighbors] weight × 2 × (percentile − 0.5)`: for the film above
// her median, against below it, and nothing within `neutral_band` of it.
// It fades with the raters' freshness, the Decaimento of her Notas the
// match rests on, as a Nota seed fades on the content path.
// The strength comes from the ruler, by how many neighbours rated it, how
// much they agree and how many films they share with her.

import { Effect } from 'effect'
import { factId } from '../../compat/fact-id.ts'
import { makeEvidence, type Evidence } from '../../evidence/Evidence.ts'
import { tasteNeighborsStrength } from '../../evidence/ruler.ts'
import { tasteNeighborsText } from '../../evidence/wording.ts'
import { text } from '../../sqlite/row.ts'
import { predictRatings } from '../taste-neighbors.ts'
import type { Signal } from './Signal.ts'

/** The `fato_id` prefix of the line: one per Pessoa and film. */
export const TASTE_NEIGHBORS_TABLE = 'vizinhos_de_gosto'

export const tasteNeighbors: Signal = {
  module: TASTE_NEIGHBORS_TABLE,
  forPerson: (round, person) =>
    Effect.gen(function* () {
      const { weight, neutral_band } = round.weights.taste_neighbors
      if (!weight) return []
      const origin = yield* round.db.get(
        'SELECT fonte, data FROM fonte_gosto_movielens LIMIT 1',
      )
      if (origin === undefined) return []
      const out: Evidence[] = []
      for (const [filmId, p] of yield* predictRatings(round, person)) {
        const tilt = p.percentile - 0.5
        if (Math.abs(tilt) < neutral_band) continue
        const strength = tasteNeighborsStrength(p.raters, p.spread, p.overlap)
        if (strength === null) continue
        out.push(
          makeEvidence({
            person,
            filmId,
            text: tasteNeighborsText(p.raters, p.meanRating),
            source: text(origin, 'fonte'),
            date: text(origin, 'data'),
            strength,
            kind: 'review',
            factId: factId(TASTE_NEIGHBORS_TABLE, person, filmId),
            base: weight * 2 * tilt * p.freshness,
          }),
        )
      }
      return out
    }),
}
