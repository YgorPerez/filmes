// The predicted rating's error (#171): the mean absolute error between the
// Nota prevista [predicted rating] and the held-out Nota, both from 1 to 10.
//
// The taste neighbours (#174) give the prediction; the ranking carries it
// in each film's `predictedRating`. A held-out film no neighbour predicts
// stays out of the error; with none, the report says it is absent.

import type { RecommendedFilm } from '../recommendation/recommend.ts'

export interface PredictedRatingError {
  /** Held-out films with both a predicted rating and a Nota. */
  readonly films: number
  readonly meanAbsoluteError: number | null
}

/** `film`'s predicted rating for `person`, from 1 to 10, or `null` when
 * her taste neighbours predict none. */
export const predictedRating = (
  film: RecommendedFilm,
  person: string,
): number | null => film.predictedRating?.[person]?.value ?? null

/** A Nota (0,5 to 5) on the predicted rating's scale, the 1 to 10 of the
 * Cartaz's Já vi. */
export const onTenScale = (rating: number): number => 2 * rating

/** The error over pairs of (predicted, Nota), both from 1 to 10. */
export const predictedRatingError = (
  pairs: ReadonlyArray<readonly [number, number]>,
): PredictedRatingError => ({
  films: pairs.length,
  meanAbsoluteError: pairs.length
    ? pairs.reduce((sum, [p, r]) => sum + Math.abs(p - r), 0) / pairs.length
    : null,
})
