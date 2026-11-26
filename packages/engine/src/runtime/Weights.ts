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
  path: Schema.Struct({
    /** By content predicate (`director`, `writer`, `series`, `cast`,
     * `genre`), in file order. A predicate outside it is not a path. */
    weight: Schema.Record(Schema.String, Weight),
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
})

export type Weights = typeof Weights.Type
