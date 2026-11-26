// Força calibration (#171): how often a held-out Nota was high (4 or more),
// by the Força the engine gave the film before the cut.
//
// Each held-out film that is still a Candidate goes into one bucket: the
// strongest Força among the Pessoa's Evidence in favour of it (a positive
// contribution that is not a guess), or `none` when nothing speaks for it.
// A calibrated ruler hits more often as the Força rises; `rises` says
// whether it does, from weak to strong, over the Forças that have held-out
// Notas (`null` with fewer than two of them). `none` is the baseline and
// stays out of that check.

import { STRENGTHS, type Strength } from '../evidence/strength.ts'
import type { RecommendedFilm } from '../recommendation/recommend.ts'

export type CalibrationBucket = Strength | 'none'

/** The held-out Notas of one bucket and how many were 4 or more. */
export interface HitRate {
  readonly heldOut: number
  readonly hits: number
  readonly hitRate: number | null
}

export interface StrengthCalibration extends Readonly<
  Record<CalibrationBucket, HitRate>
> {
  readonly rises: boolean | null
}

export interface Calibration {
  readonly overall: StrengthCalibration
  /** By Pessoa, only for the Pessoas' sample: a thousand MovieLens users
   * would drown the report. */
  readonly people: Readonly<Record<string, StrengthCalibration>>
}

/** One held-out film as the ranking scored it. */
export interface Scored {
  readonly person: string
  readonly bucket: CalibrationBucket
  readonly hit: boolean
}

/** The strongest Força in favour of `film` among `person`'s Evidence. */
export const bucketOf = (
  film: RecommendedFilm,
  person: string,
): CalibrationBucket => {
  const inFavour = new Set(
    (film.evidence[person] ?? [])
      .filter((e) => e.kind !== 'guess' && e.contribution > 0)
      .map((e) => e.strength),
  )
  return STRENGTHS.findLast((s) => inFavour.has(s)) ?? 'none'
}

const BUCKETS: ReadonlyArray<CalibrationBucket> = [...STRENGTHS, 'none']

const calibrate = (scored: ReadonlyArray<Scored>): StrengthCalibration => {
  const rates = Object.fromEntries(
    BUCKETS.map((bucket) => {
      const inBucket = scored.filter((s) => s.bucket === bucket)
      const hits = inBucket.filter((s) => s.hit).length
      return [
        bucket,
        {
          heldOut: inBucket.length,
          hits,
          hitRate: inBucket.length ? hits / inBucket.length : null,
        },
      ]
    }),
  ) as Record<CalibrationBucket, HitRate>
  const measured = STRENGTHS.map((s) => rates[s].hitRate).filter(
    (rate): rate is number => rate !== null,
  )
  return {
    ...rates,
    rises:
      measured.length < 2
        ? null
        : measured.every((rate, i) => i === 0 || rate >= measured[i - 1]!),
  }
}

/** The calibration of a sample, with the Pessoas in slug order when
 * `perPerson`. */
export const calibration = (
  scored: ReadonlyArray<Scored>,
  perPerson: boolean,
): Calibration => ({
  overall: calibrate(scored),
  people: perPerson
    ? Object.fromEntries(
        [...new Set(scored.map((s) => s.person))]
          .sort()
          .map((person) => [
            person,
            calibrate(scored.filter((s) => s.person === person)),
          ]),
      )
    : {},
})
