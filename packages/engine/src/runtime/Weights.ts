// `weights.toml`, the numbers `avaliar` calibrates (Python's
// weights file, with the English keys of ADR 0002). The Força rules
// are not here: they are fixed in code.
//
// A table whose keys are data (`path.weight`, by predicate) is a `Record`, so
// it keeps the file's key order: the content path walks it in that order, and
// the order of the Evidence follows (risk R8 of #76).

import { Schema } from 'effect'

const Weight = Schema.Finite
const Count = Schema.Int

export const Weights = Schema.Struct({
  strength: Schema.Struct({
    multiplier: Schema.Struct({
      strong: Weight,
      moderate: Weight,
      weak: Weight,
      guess: Weight,
    }),
  }),
  rating_decay: Schema.Struct({
    /** Years for a Nota's contribution to halve. */
    half_life_years: Schema.Finite.check(Schema.isGreaterThan(0)),
    /** The least a Nota's contribution keeps, from 0 to 1. */
    floor: Weight,
  }),
  path: Schema.Struct({
    /** By content predicate (`director`, `writer`, `series`, `cast`,
     * `genre`), in file order. A predicate outside it is not a path. */
    weight: Schema.Record(Schema.String, Weight),
  }),
  /** The cut points of the Nota ruler (#172): a Nota at or above a cut's
   * percentile gets that level, read on the Pessoa's scale (her own Notas
   * from `min_ratings` on, the MovieLens population's below). */
  rating_percentile: Schema.Struct({
    min_ratings: Count,
    strong: Weight,
    moderate: Weight,
    weak: Weight,
    weak_against: Weight,
    moderate_against: Weight,
  }),
  utility: Schema.Struct({ k: Weight, max_evidence: Count }),
  adjustment: Schema.Struct({
    level: Schema.Struct({
      none: Weight,
      low: Weight,
      normal: Weight,
      high: Weight,
    }),
  }),
  catalog: Schema.Struct({ min_votes: Count, min_imdb_rating: Weight }),
  recommendation: Schema.Struct({ size: Count }),
  seen: Schema.Struct({ weight: Weight }),
  satisfaction: Schema.Struct({ factor: Weight, window: Count }),
  neighbors: Schema.Struct({ weight: Weight }),
  /** The taste neighbours (#174): how many, how many films each must share
   * with the Pessoa, the Evidence's weight, and the band around her median
   * where they say nothing. */
  taste_neighbors: Schema.Struct({
    k: Count,
    min_shared: Count,
    weight: Weight,
    neutral_band: Weight,
  }),
  /** The Calibração da Nota prevista (#210): how many films of no
   * correction the fit is weighed against. */
  prediction_calibration: Schema.Struct({
    pseudo_count: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
  }),
  /** The Aposta (#178): its place (0: none), the lowest mean Nota
   * prevista, 1 to 10, and how many Facts it may have. */
  bet: Schema.Struct({
    position: Count,
    min_predicted: Weight,
    max_facts: Count,
    prior_successes: Weight.check(Schema.isGreaterThan(0)),
    prior_failures: Weight.check(Schema.isGreaterThan(0)),
    min_success_rate: Weight.check(
      Schema.isBetween({ minimum: 0, maximum: 1 }),
    ),
    max_predicted_increase: Weight.check(Schema.isGreaterThanOrEqualTo(0)),
  }),
  /** The Perguntas par a par (#181): how many pairs each Presente is
   * asked in a Session. */
  pairwise: Schema.Struct({ pairs: Count }),
  mood: Schema.Struct({ weight: Weight }),
  group: Schema.Struct({ weight: Weight }),
  people: Schema.Struct({ statement_weight: Weight }),
  constraints: Schema.Struct({ on_demand_reach: Count }),
  tag_vetoes: Schema.Struct({ min_relevance: Weight, min_users: Count }),
  imdb_rating: Schema.Struct({ weight: Weight }),
  no_sad: Schema.Struct({
    min_users_sad: Count,
    min_users_heavy_theme: Count,
    min_relevance: Weight,
  }),
  similar: Schema.Struct({
    candidates: Count,
    genome_tags: Count,
    genome_tags_considered: Count,
    movielens_tags: Count,
    /** By similarity source, in file order. */
    weight: Schema.Record(Schema.String, Weight),
  }),
  diversity: Schema.Struct({ lambda: Weight, depth: Count, pool: Count }),
})

export type Weights = typeof Weights.Type
