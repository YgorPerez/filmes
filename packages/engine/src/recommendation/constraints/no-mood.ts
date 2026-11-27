// Nada de um Clima [no_mood]: "nada de terror", "sem comédia" (#272). The
// film of a Clima the Dono turned away is out: one of the Clima's Wikidata
// genres (the `genero` edges, as the Clima's bonus reads them), or one of
// its tags with the `[tag_vetoes]` minimums (relevance in the Tag Genome or
// users in MovieLens' tags.csv), the same as a Veto by group. The Clima
// asked for pulls the order and never removes a film; this one only
// removes. A name outside `moods.toml` is a warning, as for the Clima.

import { Effect } from 'effect'
import { Run } from '../../runtime/Run.ts'
import type { Weights } from '../../runtime/Weights.ts'
import type { Connection, SqliteError } from '../../sqlite/Sqlite.ts'
import { text } from '../../sqlite/row.ts'
import {
  filmsJson,
  pass,
  type Constraint,
  type ConstraintModule,
} from '../constraints.ts'
import type { Candidate } from '../candidates.ts'
import { resolveMoods, type Mood } from '../moods.ts'

export interface NoMoodRequest {
  /** The Climas turned away, by name. */
  readonly noMoods?: ReadonlyArray<string>
}

const marks = (items: ReadonlyArray<unknown>) => items.map(() => '?').join(',')

/** The films among `films` with one of the Climas' genres or tags. */
const marked = (
  db: Connection,
  moods: ReadonlyArray<Mood>,
  minimums: Weights['tag_vetoes'],
  films: ReadonlyMap<string, Candidate>,
): Effect.Effect<Set<string>, SqliteError> =>
  Effect.gen(function* () {
    const tags = [...new Set(moods.flatMap((mood) => mood.tags))]
    const genres = [...new Set(moods.flatMap((mood) => mood.genres))]
    const within = filmsJson(films)
    const queries: Array<[string, ReadonlyArray<string | number>]> = [
      [
        `SELECT filme_id FROM genoma WHERE relevancia >= ? AND tag IN (${marks(tags)}) AND +filme_id IN (SELECT value FROM json_each(?))`,
        [minimums.min_relevance, ...tags, within],
      ],
      [
        `SELECT filme_id FROM tags_movielens WHERE usuarios >= ? AND tag IN (${marks(tags)}) AND +filme_id IN (SELECT value FROM json_each(?))`,
        [minimums.min_users, ...tags, within],
      ],
      [
        `SELECT filme_id FROM arestas WHERE predicado = 'genero' AND entidade_id IN (${marks(genres)}) AND +filme_id IN (SELECT value FROM json_each(?))`,
        [...genres, within],
      ],
    ]
    const out = new Set<string>()
    for (const [sql, params] of queries)
      for (const row of yield* db.all(sql, ...params))
        out.add(text(row, 'filme_id'))
    return out
  })

/** "nada assustador", "nada leve nem tenso". */
const labelOf = (names: ReadonlyArray<string>): string =>
  `nada ${names.join(' nem ')}`

const noMood = (names: ReadonlyArray<string>): Constraint => ({
  name: 'no_mood',
  toJson: () => ({ moods: [...names] }),
  stored: () => ({ name: 'no_mood', moods: [...names] }),
  result: () => ({}),
  evaluate: (context, films) =>
    Effect.gen(function* () {
      const { moods, warnings } = yield* resolveMoods(names)
      const run = yield* Run
      for (const warning of warnings) yield* run.warn(warning)
      const out =
        moods.length === 0
          ? new Set<string>()
          : yield* marked(context.db, moods, context.weights.tag_vetoes, films)
      return new Map(
        [...films.keys()].filter((id) => !out.has(id)).map((id) => [id, pass()]),
      )
    }),
})

export const noMoodModule: ConstraintModule<NoMoodRequest> = {
  name: 'no_mood',
  read: (request) =>
    Effect.succeed(
      request.noMoods && request.noMoods.length > 0
        ? noMood([...new Set(request.noMoods)])
        : undefined,
    ),
  label: (stored) =>
    labelOf(Array.isArray(stored['moods']) ? stored['moods'].map(String) : []),
}

/** How the Leitura do pedido labels the Climas it read as turned away. */
export const noMoodLabel = labelOf
