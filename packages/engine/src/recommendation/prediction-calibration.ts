// The Calibração da Nota prevista [prediction calibration] (#210): a line
// from the taste neighbours' percentile to the Pessoa's own, fitted on the
// films she rated.
//
// Each comparison is one of her Notas: the percentile her neighbours would
// have given the film had she not rated it (`taste-neighbors.ts` leaves the
// film out when choosing them), and the percentile of her Nota on her
// scale. Least squares gives an offset and a slope; with `n` comparisons
// the fit weighs n / (n + `[prediction_calibration] pseudo_count`), the
// rest staying the identity, so a Pessoa with few comparable films keeps
// nearly the neighbours' own prediction.

import { mean } from './mean.ts'

/** One of her Notas: what the neighbours would have predicted (their mean
 * percentile, without her Nota), and the percentile she gave it. */
export interface Comparison {
  readonly predicted: number
  readonly own: number
}

/** Her percentile from the neighbours': `offset + slope × theirs`. */
export interface PredictionCalibration {
  readonly offset: number
  readonly slope: number
  /** How many of her films it was fitted on. */
  readonly films: number
}

const NO_CALIBRATION: PredictionCalibration = {
  offset: 0,
  slope: 1,
  films: 0,
}

/** The least-squares line through the comparisons, shrunk toward the
 * identity by `pseudoCount` films. Without spread in the predictions the
 * slope stays 1 and only the offset moves; a slope below 0, which would
 * turn the prediction upside down, stays 0. */
export const fitCalibration = (
  comparisons: ReadonlyArray<Comparison>,
  pseudoCount: number,
): PredictionCalibration => {
  const n = comparisons.length
  if (n === 0) return NO_CALIBRATION
  const x = mean(comparisons.map((c) => c.predicted))
  const y = mean(comparisons.map((c) => c.own))
  let sxx = 0
  let sxy = 0
  for (const c of comparisons) {
    sxx += (c.predicted - x) ** 2
    sxy += (c.predicted - x) * (c.own - y)
  }
  const fitted = sxx > 1e-12 ? Math.max(0, sxy / sxx) : 1
  const weight = n / (n + pseudoCount)
  return {
    offset: weight * (y - fitted * x),
    slope: 1 + weight * (fitted - 1),
    films: n,
  }
}

/** The neighbours' percentile `p` corrected for her, from 0 to 1. */
export const calibrate = (
  calibration: PredictionCalibration,
  p: number,
): number =>
  Math.min(1, Math.max(0, calibration.offset + calibration.slope * p))
