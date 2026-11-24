// The IMDb rating bonus: a film line for the Candidate rated above the
// minimum (`recomendacao/sinais/nota_imdb.py`).
//
// The bonus is `[imdb_rating] weight × (rating − minimum) / (10 − minimum)`,
// with `[catalog] min_imdb_rating`: a film at the limit gets 0, a 10 the
// whole weight. Like the Clima's, it adds to the Regra's score and never to
// anyone's utility (the Dono's decision of 2026-11-22). The line does not
// count as a Fact: a film with only it is still "só palpites".

import { Effect } from 'effect'
import { factId, pyFloat } from '../../compat/fact-id.ts'
import { makeEvidence, type Evidence } from '../../evidence/Evidence.ts'
import { imdbRatingStrength } from '../../evidence/ruler.ts'
import { ratingText } from '../../evidence/wording.ts'
import type { Signal } from './Signal.ts'

/** The `fato_id` prefix of the line, which tells it apart in the output. */
export const IMDB_RATING_TABLE = 'nota_imdb'

export const imdbRating: Signal = {
  module: 'nota_imdb',
  forFilm: (round) =>
    Effect.sync(() => {
      const weight = round.weights.imdb_rating.weight
      const minimum = round.weights.catalog.min_imdb_rating
      if (!weight || minimum >= 10) return []
      const out: Evidence[] = []
      for (const [filmId, film] of round.candidates) {
        const rating = film.imdbRating
        if (rating === null || rating <= minimum) continue
        out.push(
          makeEvidence({
            person: null,
            filmId,
            text: `nota ${ratingText(rating)} no IMDb`,
            source: 'IMDb',
            date: film.imdbDate,
            strength: imdbRatingStrength(),
            kind: 'metadata',
            factId: factId(IMDB_RATING_TABLE, filmId, pyFloat(rating)),
            base: (weight * (rating - minimum)) / (10 - minimum),
            countsAsFact: false,
          }),
        )
      }
      return out
    }),
}
