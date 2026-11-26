// The predicted rating's error (#171): the mean absolute error between the
// Nota prevista [predicted rating] and the held-out Nota, both from 1 to 10.
//
// The taste neighbours (#174) give the prediction; the ranking carries it
// in each film's `predictedRating`. A held-out film no neighbour predicts
// stays out of the error; with none, the report says it is absent. The
// error is measured on the calibrated prediction (#210), the one the
// Cartaz shows, and on the raw one, to see whether the calibration helps.

import type { RecommendedFilm } from '../recommendation/recommend.ts'

export interface PredictedRatingError {
  /** Held-out films with both a predicted rating and a Nota. */
  readonly films: number
  /** On the calibrated prediction. */
  readonly meanAbsoluteError: number | null
  /** On the prediction before the calibration. */
  readonly rawMeanAbsoluteError: number | null
}

/** A held-out film's predictions, calibrated and raw, and its Nota, all
 * from 1 to 10. */
export interface PredictedPair {
  readonly predicted: number
  readonly raw: number
  readonly rating: number
}

/** `film`'s predicted rating for `person`, calibrated and raw, from 1 to
 * 10, or `null` when her taste neighbours predict none. */
export const predictedRating = (
  film: RecommendedFilm,
  person: string,
): { readonly predicted: number; readonly raw: number } | null => {
  const prediction = film.predictedRating?.[person]
  return prediction === undefined
    ? null
    : { predicted: prediction.value, raw: prediction.raw }
}

/** A Nota (0,5 to 5) on the predicted rating's scale, the 1 to 10 of the
 * Cartaz's Já vi. */
export const onTenScale = (rating: number): number => 2 * rating

const meanError = (
  pairs: ReadonlyArray<PredictedPair>,
  of: (pair: PredictedPair) => number,
): number | null =>
  pairs.length
    ? pairs.reduce((sum, pair) => sum + Math.abs(of(pair) - pair.rating), 0) /
      pairs.length
    : null

/** The error over the held-out films, calibrated and raw. */
export const predictedRatingError = (
  pairs: ReadonlyArray<PredictedPair>,
): PredictedRatingError => ({
  films: pairs.length,
  meanAbsoluteError: meanError(pairs, (pair) => pair.predicted),
  rawMeanAbsoluteError: meanError(pairs, (pair) => pair.raw),
})
