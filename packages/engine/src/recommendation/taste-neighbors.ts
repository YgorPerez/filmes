// Vizinhos de gosto [taste neighbours] and the Nota prevista [predicted
// rating] (#174), Criticker's Probable Score Indicator on public data.
//
// A Pessoa's neighbours are the `[taste_neighbors] k` users of the
// MovieLens sample (`notas_gosto_movielens`) closest to her: the distance
// is the mean, over the films both rated, of the difference between the
// percentile of her Nota on her scale and the percentile of the user's on
// his (`percentis_gosto_movielens`). Only users who rated at least
// `min_shared` of her films count. Ties go to whoever shares more films,
// then to the lower user id.
//
// On a Candidate, the neighbours who rated it give its prediction: the mean
// of their percentiles, read back as a Nota on her scale
// (`ratingAtPercentile`) and doubled to the 1 to 10 of the Cartaz. Fewer
// than `MIN_TASTE_RATERS` give none. Her scale is the ruler's, so the same
// percentile is a higher Nota for someone who rates high.
//
// It reads `notas_vigentes`, so in `evaluate` it sees only the Notas
// before the cut, and `notas_gosto_movielens`, which `evaluate` shadows
// without its own sampled users.

import { Effect } from 'effect'
import {
  MIN_TASTE_RATERS,
  ratingAtPercentile,
  ratingPercentile,
  type RatingScale,
} from '../evidence/ruler.ts'
import { readRatingScale } from '../people/rating-scale.ts'
import type { Weights } from '../runtime/Weights.ts'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'
import { num, text } from '../sqlite/row.ts'
import { candidatesJson, type Round } from './signals/Signal.ts'

export interface TasteNeighbor {
  readonly user: number
  /** Mean difference of percentiles over the films shared, 0 to 1. */
  readonly distance: number
  /** Films both rated. */
  readonly shared: number
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
  /** The Nota prevista: `percentile` read on her scale, 1 to 10. */
  readonly value: number
  /** The standard deviation of each neighbour's percentile read on her
   * scale, 1 to 10: how uncertain `value` is. */
  readonly deviation: number
}

const OWN_RATINGS = `
SELECT filme_id, nota FROM notas_vigentes
WHERE pessoa = ? AND tipo = 'nota' ORDER BY filme_id
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

/** The closest `k` among the users who share `minShared` films or more,
 * from (user, |her percentile − his|) pairs. */
const closest = (
  differences: Iterable<readonly [number, number]>,
  k: number,
  minShared: number,
): ReadonlyArray<TasteNeighbor> => {
  const sums = new Map<number, [number, number]>()
  for (const [user, difference] of differences) {
    const sum = sums.get(user) ?? [0, 0]
    sum[0] += difference
    sum[1] += 1
    sums.set(user, sum)
  }
  return [...sums]
    .filter(([, [, shared]]) => shared >= minShared)
    .map(([user, [total, shared]]) => ({
      user,
      distance: total / shared,
      shared,
    }))
    .sort(
      (a, b) =>
        a.distance - b.distance || b.shared - a.shared || a.user - b.user,
    )
    .slice(0, k)
}

interface Found {
  readonly scale: RatingScale
  readonly neighbors: ReadonlyArray<TasteNeighbor>
}

/** Per connection, by Pessoa and what she rated: `evaluate` ranks the
 * same Pessoa many times with the same Notas. */
const found = new WeakMap<Connection, Map<string, Found>>()

/** The taste neighbours of `person`, and her scale. */
export const tasteNeighbors = (
  db: Connection,
  person: string,
  weights: Pick<Weights, 'rating_percentile' | 'taste_neighbors'>,
): Effect.Effect<Found, SqliteError> =>
  Effect.gen(function* () {
    const scale = yield* readRatingScale(db, person, weights)
    const own = new Map(
      (yield* db.all(OWN_RATINGS, person)).map((row) => [
        text(row, 'filme_id'),
        ratingPercentile(scale, num(row, 'nota')),
      ]),
    )
    const { k, min_shared } = weights.taste_neighbors
    const key = JSON.stringify([person, k, min_shared, [...own]])
    const cache = found.get(db) ?? new Map<string, Found>()
    found.set(db, cache)
    const cached = cache.get(key)
    if (cached !== undefined) return cached
    const rows =
      own.size >= min_shared && k > 0
        ? yield* db.all(SHARED, JSON.stringify([...own.keys()]))
        : []
    const result: Found = {
      scale,
      neighbors: closest(
        rows.map((row) => [
          num(row, 'usuario'),
          Math.abs(own.get(text(row, 'filme_id'))! - num(row, 'percentil')),
        ]),
        k,
        min_shared,
      ),
    }
    cache.set(key, result)
    return result
  })

const mean = (values: ReadonlyArray<number>): number =>
  values.reduce((sum, v) => sum + v, 0) / values.length

const deviation = (values: ReadonlyArray<number>): number => {
  const m = mean(values)
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)))
}

/** On her 1 to 10: twice the Nota of her scale at that percentile. */
const onHerScale = (scale: RatingScale, p: number): number | null => {
  const rating = ratingAtPercentile(scale, p)
  return rating === null ? null : 2 * rating
}

/** A Candidate's prediction from what its raters gave it, or `null` with
 * too few raters or an empty scale. */
const predict = (
  scale: RatingScale,
  raters: ReadonlyArray<{
    readonly rating: number
    readonly percentile: number
    readonly shared: number
  }>,
): TastePrediction | null => {
  if (raters.length < MIN_TASTE_RATERS) return null
  const percentiles = raters.map((r) => r.percentile)
  const percentile = mean(percentiles)
  const value = onHerScale(scale, percentile)
  if (value === null) return null
  return {
    percentile,
    raters: raters.length,
    meanRating: mean(raters.map((r) => r.rating)),
    spread: deviation(percentiles),
    overlap: mean(raters.map((r) => r.shared)),
    value,
    deviation: deviation(percentiles.map((p) => onHerScale(scale, p)!)),
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
    const { scale, neighbors } = yield* tasteNeighbors(
      round.db,
      person,
      round.weights,
    )
    const out = new Map<string, TastePrediction>()
    if (neighbors.length > 0) {
      const shared = new Map(neighbors.map((n) => [n.user, n.shared]))
      const byFilm = new Map<
        string,
        Array<{ rating: number; percentile: number; shared: number }>
      >()
      for (const row of yield* round.db.all(
        RATED,
        JSON.stringify([...shared.keys()]),
        candidatesJson(round),
      )) {
        const film = text(row, 'filme_id')
        const raters = byFilm.get(film) ?? []
        raters.push({
          rating: num(row, 'nota'),
          percentile: num(row, 'percentil'),
          shared: shared.get(num(row, 'usuario'))!,
        })
        byFilm.set(film, raters)
      }
      for (const [film, raters] of byFilm) {
        const prediction = predict(scale, raters)
        if (prediction !== null) out.set(film, prediction)
      }
    }
    ofRound.set(person, out)
    return out
  })
