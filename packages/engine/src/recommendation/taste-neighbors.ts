// Vizinhos de gosto [taste neighbours] and the Nota prevista [predicted
// rating] (#174), Criticker's Probable Score Indicator on public data.
//
// A Pessoa's neighbours are the `[taste_neighbors] k` users of the
// MovieLens sample (`notas_gosto_movielens`) closest to her: the distance
// is the mean, over the films both rated, of the difference between the
// percentile of her Nota on her scale and the percentile of the user's on
// his (`percentis_gosto_movielens`), each film weighted by the Decaimento
// of her Nota (`decay.ts`), so her taste of today chooses them. Only users who rated at least
// `min_shared` of her films count. Ties go to whoever shares more films,
// then to the lower user id. Each neighbour's freshness is the mean
// Decaimento (`decay.ts`) of her Notas he shares: the Evidence of the
// neighbours fades with it, as a Nota seed fades on the other paths.
//
// On a Candidate, the neighbours who rated it give its prediction: the mean
// of their percentiles, read back as a Nota on her scale
// (`ratingAtPercentile`) and doubled to the 1 to 10 of the Cartaz. Fewer
// than `MIN_TASTE_RATERS` give none. Her scale is the ruler's, so the same
// percentile is a higher Nota for someone who rates high.
//
// The prediction is then calibrated to her (#210,
// `prediction-calibration.ts`): on each film she rated, the neighbours
// chosen without that film predict it, and a line from their percentile
// to hers corrects every prediction. The Evidence keeps the neighbours'
// own percentile; the Nota prevista and its deviation are the calibrated
// ones, and `raw` keeps the one before.
//
// It reads `notas_vigentes`, so in `evaluate` it sees only the Notas
// before the cut, in the neighbours and in the calibration, and
// `notas_gosto_movielens`, which `evaluate` shadows without its own
// sampled users.

import { Effect } from 'effect'
import { ratingDecay } from '../evidence/decay.ts'
import {
  MIN_TASTE_RATERS,
  ratingAtPercentile,
  ratingPercentile,
  type RatingScale,
} from '../evidence/ruler.ts'
import { readRatingScale } from '../people/rating-scale.ts'
import type { Weights } from '../runtime/Weights.ts'
import {
  calibrate,
  fitCalibration,
  type Comparison,
  type PredictionCalibration,
} from './prediction-calibration.ts'
import type { Connection, Row, SqliteError } from '../sqlite/Sqlite.ts'
import { num, text } from '../sqlite/row.ts'
import { candidatesJson, scaleOf, type Round } from './signals/Signal.ts'
import { mean } from './mean.ts'

interface TasteNeighbor {
  readonly user: number
  /** Mean difference of percentiles over the films shared, weighted by
   * the Decaimento of her Notas, 0 to 1. */
  readonly distance: number
  /** Films both rated. */
  readonly shared: number
  /** The mean Decaimento of her Notas on those films, from the floor
   * to 1. */
  readonly freshness: number
}

/** What the neighbours who rated a Candidate say about it. */
export interface TastePrediction {
  /** Their mean percentile, each on his own scale, 0 to 1. */
  readonly percentile: number
  /** How many neighbours rated it. */
  readonly raters: number
  /** Their mean MovieLens rating, 0,5 to 5, for the Evidence's line. */
  readonly meanRating: number
  /** The standard deviation of their percentiles. */
  readonly spread: number
  /** The mean number of films each shares with the Pessoa. */
  readonly overlap: number
  /** The mean freshness of the raters: how much the Evidence keeps of
   * its weight as her Notas age. */
  readonly freshness: number
  /** The Nota prevista: `percentile` calibrated to her and read on her
   * scale, 1 to 10. */
  readonly value: number
  /** `percentile` read on her scale without the calibration, 1 to 10. */
  readonly raw: number
  /** The standard deviation of each neighbour's calibrated percentile
   * read on her scale, 1 to 10: how uncertain `value` is. */
  readonly deviation: number
}

/** Her Notas, without a pairwise answer's: it says only which of two
 * films she liked more, not where it sits on her scale. */
const OWN_RATINGS = `
SELECT filme_id, nota, data FROM notas_vigentes
WHERE pessoa = ? AND tipo = 'nota' AND NOT par_a_par ORDER BY filme_id
`

/** The percentiles of every sample user who rated one of these films. */
const SHARED = `
SELECT g.usuario, g.filme_id, p.percentil
FROM notas_gosto_movielens g
JOIN percentis_gosto_movielens p ON p.usuario = g.usuario AND p.nota = g.nota
WHERE g.filme_id IN (SELECT value FROM json_each(?1))
`

/** What the neighbours gave the Candidates. The `+` keeps SQLite on each
 * neighbour's own ratings, with the Candidates as a membership test. */
const RATED = `
SELECT g.usuario, g.filme_id, g.nota, p.percentil
FROM notas_gosto_movielens g
JOIN percentis_gosto_movielens p ON p.usuario = g.usuario AND p.nota = g.nota
WHERE g.usuario IN (SELECT value FROM json_each(?1))
  AND +g.filme_id IN (SELECT value FROM json_each(?2))
ORDER BY g.filme_id, g.usuario
`

/** One of her Notas: its percentile on her scale and its Decaimento. */
interface OwnRating {
  readonly rating: number
  readonly percentile: number
  readonly decay: number
}

/** A sample user's rating of one of her films. */
interface SharedRating {
  readonly user: number
  readonly percentile: number
}

/** One user's sums over her films he rated. */
interface UserSums {
  /** Σ |her percentile − his| × her Nota's Decaimento. */
  total: number
  shared: number
  /** Σ her Notas' Decaimento. */
  decay: number
}

/** Who is closer: by distance, then by more films shared, then by the
 * lower user id. */
const closer = (
  a: Pick<TasteNeighbor, 'user' | 'distance' | 'shared'>,
  b: Pick<TasteNeighbor, 'user' | 'distance' | 'shared'>,
): number => a.distance - b.distance || b.shared - a.shared || a.user - b.user

interface RatedComparison extends Comparison {
  readonly rating: number
}

/** Her taste neighbours, and the comparisons the calibration is fitted
 * on. */
interface Neighbourhood {
  readonly neighbors: ReadonlyArray<TasteNeighbor>
  readonly comparisons: ReadonlyArray<RatedComparison>
}

/** Every user who shares `minShared` of her films or more, the closest
 * first, from his sums. */
const ranked = (
  sums: ReadonlyMap<number, UserSums>,
  minShared: number,
): ReadonlyArray<TasteNeighbor> =>
  [...sums]
    .filter(([, { shared }]) => shared >= minShared)
    .map(([user, { total, shared, decay }]) => ({
      user,
      distance: total / decay,
      shared,
      freshness: decay / shared,
    }))
    .sort(closer)

/** What the neighbours chosen without one of her films would have
 * predicted for it: the mean percentile of its `raters` among the closest
 * `k`, or `null` with fewer than `MIN_TASTE_RATERS`. Only its raters move
 * when it leaves: the others keep their place in `everyone`. */
const leftOut = (
  mine: OwnRating,
  raters: ReadonlyArray<SharedRating>,
  everyone: ReadonlyArray<TasteNeighbor>,
  sums: ReadonlyMap<number, UserSums>,
  k: number,
  minShared: number,
): number | null => {
  const moved = new Set(raters.map((r) => r.user))
  const without = raters
    .flatMap((r) => {
      const sum = sums.get(r.user)!
      const shared = sum.shared - 1
      if (shared < Math.max(1, minShared)) return []
      const difference = Math.abs(mine.percentile - r.percentile)
      return [
        {
          user: r.user,
          distance:
            (sum.total - difference * mine.decay) / (sum.decay - mine.decay),
          shared,
          percentile: r.percentile,
        },
      ]
    })
    .sort(closer)
  const chosen: number[] = []
  let i = 0
  let j = 0
  for (let taken = 0; taken < k; taken += 1) {
    while (i < everyone.length && moved.has(everyone[i]!.user)) i += 1
    const stayed = everyone[i]
    const rater = without[j]
    if (
      rater !== undefined &&
      (stayed === undefined || closer(rater, stayed) < 0)
    ) {
      chosen.push(rater.percentile)
      j += 1
    } else if (stayed !== undefined) i += 1
    else break
  }
  return chosen.length < MIN_TASTE_RATERS ? null : mean(chosen)
}

/** By neighbour, the decayed distance to `own` on the films both rated;
 * by film, the neighbours' ratings of it. */
const sharedRatings = (
  rows: ReadonlyArray<Row>,
  own: ReadonlyMap<string, OwnRating>,
) => {
  const sums = new Map<number, UserSums>()
  const byFilm = new Map<string, SharedRating[]>()
  for (const row of rows) {
    const film = text(row, 'filme_id')
    const mine = own.get(film)!
    const rating = {
      user: num(row, 'usuario'),
      percentile: num(row, 'percentil'),
    }
    const sum = sums.get(rating.user) ?? { total: 0, shared: 0, decay: 0 }
    sum.total += Math.abs(mine.percentile - rating.percentile) * mine.decay
    sum.shared += 1
    sum.decay += mine.decay
    sums.set(rating.user, sum)
    const raters = byFilm.get(film) ?? []
    raters.push(rating)
    byFilm.set(film, raters)
  }
  return { sums, byFilm }
}

/** Per connection, by Pessoa and what she rated: `evaluate` ranks the
 * same Pessoa many times with the same Notas. */
const found = new WeakMap<Connection, Map<string, Neighbourhood>>()

/** The taste neighbours of `person`, read on her `scale`, and, for each
 * film she rated, what the neighbours chosen without it predict. */
const tasteNeighbourhood = (
  db: Connection,
  person: string,
  scale: RatingScale,
  weights: Pick<Weights, 'taste_neighbors' | 'rating_decay'>,
  today: string,
): Effect.Effect<Neighbourhood, SqliteError> =>
  Effect.gen(function* () {
    const own = new Map<string, OwnRating>(
      (yield* db.all(OWN_RATINGS, person)).map((row) => {
        const rating = num(row, 'nota')
        return [
          text(row, 'filme_id'),
          {
            rating,
            percentile: ratingPercentile(scale, rating),
            decay: ratingDecay(text(row, 'data'), today, weights.rating_decay),
          },
        ]
      }),
    )
    const { k, min_shared } = weights.taste_neighbors
    const key = JSON.stringify([person, k, min_shared, [...own]])
    const cache = found.get(db) ?? new Map<string, Neighbourhood>()
    found.set(db, cache)
    const cached = cache.get(key)
    if (cached !== undefined) return cached
    const rows =
      own.size >= min_shared && k > 0
        ? yield* db.all(SHARED, JSON.stringify([...own.keys()]))
        : []
    const { sums, byFilm } = sharedRatings(rows, own)
    const everyone = ranked(sums, min_shared)
    const comparisons: RatedComparison[] = []
    for (const [film, mine] of own) {
      const predicted = leftOut(
        mine,
        byFilm.get(film) ?? [],
        everyone,
        sums,
        k,
        min_shared,
      )
      if (predicted !== null)
        comparisons.push({
          predicted,
          own: mine.percentile,
          rating: mine.rating,
        })
    }
    const result = { neighbors: everyone.slice(0, k), comparisons }
    cache.set(key, result)
    return result
  })

const deviation = (values: ReadonlyArray<number>): number => {
  const m = mean(values)
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)))
}

/** On her 1 to 10: twice the Nota of her scale at that percentile. */
const onHerScale = (scale: RatingScale, p: number): number | null => {
  const rating = ratingAtPercentile(scale, p)
  return rating === null ? null : 2 * rating
}

export interface PersonPredictionError {
  readonly films: number
  readonly meanAbsoluteError: number
}

/** How far her calibrated Nota prevista is from her Nota, in points out
 * of 10, on average over the films she rated: each film scored with the
 * calibration fitted on the others, as `evaluate` scores a film the
 * calibration never saw. */
export const personPredictionError = (
  db: Connection,
  person: string,
  weights: Weights,
  today: string,
): Effect.Effect<PersonPredictionError | null, SqliteError> =>
  Effect.gen(function* () {
    const scale = yield* readRatingScale(db, person, weights)
    if (scale.source === 'population') return null
    const { comparisons } = yield* tasteNeighbourhood(
      db,
      person,
      scale,
      weights,
      today,
    )
    const films = comparisons.length
    if (films < Math.max(1, weights.rating_percentile.min_ratings)) return null
    const errors = comparisons.map(({ predicted, rating }, i) => {
      const calibration = fitCalibration(
        comparisons.filter((_, j) => j !== i),
        weights.prediction_calibration.pseudo_count,
      )
      const value = onHerScale(scale, calibrate(calibration, predicted))!
      return Math.abs(value - 2 * rating)
    })
    return { films, meanAbsoluteError: mean(errors) }
  })

/** A neighbour's rating of a Candidate. */
interface Rater {
  readonly rating: number
  readonly percentile: number
  readonly shared: number
  readonly freshness: number
}

/** A Candidate's prediction from what its raters gave it, calibrated to
 * her, or `null` with too few raters or an empty scale. */
const predict = (
  scale: RatingScale,
  calibration: PredictionCalibration,
  raters: ReadonlyArray<Rater>,
): TastePrediction | null => {
  if (raters.length < MIN_TASTE_RATERS) return null
  const percentiles = raters.map((r) => r.percentile)
  const percentile = mean(percentiles)
  const value = onHerScale(scale, calibrate(calibration, percentile))
  const raw = onHerScale(scale, percentile)
  if (value === null || raw === null) return null
  return {
    percentile,
    raters: raters.length,
    meanRating: mean(raters.map((r) => r.rating)),
    spread: deviation(percentiles),
    overlap: mean(raters.map((r) => r.shared)),
    freshness: mean(raters.map((r) => r.freshness)),
    value,
    raw,
    deviation: deviation(
      percentiles.map((p) => onHerScale(scale, calibrate(calibration, p))!),
    ),
  }
}

const predictions = new WeakMap<
  Round,
  Map<string, ReadonlyMap<string, TastePrediction>>
>()

/** What `person`'s taste neighbours say about each of the round's
 * Candidates they rated, by film id. Computed once per round and Pessoa:
 * the signal makes Evidence of it, the recommendation shows the predicted
 * rating. */
export const predictRatings = (
  round: Round,
  person: string,
): Effect.Effect<ReadonlyMap<string, TastePrediction>, SqliteError> =>
  Effect.gen(function* () {
    const ofRound = predictions.get(round) ?? new Map()
    predictions.set(round, ofRound)
    const cached = ofRound.get(person)
    if (cached !== undefined) return cached
    const scale = scaleOf(round, person)
    const { neighbors, comparisons } = yield* tasteNeighbourhood(
      round.db,
      person,
      scale,
      round.weights,
      round.today,
    )
    const calibration = fitCalibration(
      comparisons,
      round.weights.prediction_calibration.pseudo_count,
    )
    const out = new Map<string, TastePrediction>()
    if (neighbors.length > 0) {
      const byUser = new Map(neighbors.map((n) => [n.user, n]))
      const byFilm = new Map<string, Rater[]>()
      for (const row of yield* round.db.all(
        RATED,
        JSON.stringify([...byUser.keys()]),
        candidatesJson(round),
      )) {
        const film = text(row, 'filme_id')
        const raters = byFilm.get(film) ?? []
        const { shared, freshness } = byUser.get(num(row, 'usuario'))!
        raters.push({
          rating: num(row, 'nota'),
          percentile: num(row, 'percentil'),
          shared,
          freshness,
        })
        byFilm.set(film, raters)
      }
      for (const [film, raters] of byFilm) {
        const prediction = predict(scale, calibration, raters)
        if (prediction !== null) out.set(film, prediction)
      }
    }
    ofRound.set(person, out)
    return out
  })
