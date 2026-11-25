// Nada triste [no_sad]: only when the Dono asks, the sad or heavy-themed
// film is out (`restricoes/sem_tristeza.py`). Two signals, with the lists in
// `sadness.toml` and the minimums in `[no_sad]` of `weights.toml`:
//
// - sad: a sadness tag ("sad", "bleak"...) in MovieLens' tags.csv or in the
//   Tag Genome;
// - heavy theme: a heavy-theme tag ("massacre", "suicide"...) in the same two
//   tables, or a Wikidata item (Holocaust, suicide...) as `tema` or
//   `baseado_em`.
//
// A film with no signal passes. A missing tag does not prove the film is
// light, so the line of a film that passes is a guess.

import { Effect, Schema } from 'effect'
import { makeEvidence } from '../../evidence/Evidence.ts'
import { guessStrength } from '../../evidence/ruler.ts'
import { Environment } from '../../runtime/Environment.ts'
import type { Weights } from '../../runtime/Weights.ts'
import { text } from '../../sqlite/row.ts'
import type { SQLInputValue } from 'node:sqlite'
import type { Connection, SqliteError } from '../../sqlite/Sqlite.ts'
import {
  drop,
  pass,
  type Constraint,
  type ConstraintModule,
  type Verdict,
} from '../constraints.ts'

export interface NoSadRequest {
  /** `--sem-tristeza`. */
  readonly noSad?: boolean
}

/** In this order: a film with both signals counts in the first. */
const SIGNALS = ['sad', 'heavy_theme'] as const
type SadSignal = (typeof SIGNALS)[number]

const SignalList = Schema.Struct({
  tags: Schema.optionalKey(Schema.Array(Schema.String)),
  wikidata: Schema.optionalKey(Schema.Array(Schema.String)),
})
const SadnessToml = Schema.Struct({
  sad: SignalList,
  heavy_theme: SignalList,
})

const MIN_USERS: Record<SadSignal, keyof Weights['no_sad']> = {
  sad: 'min_users_sad',
  heavy_theme: 'min_users_heavy_theme',
}

const marks = (items: ReadonlyArray<unknown>) => items.map(() => '?').join(',')

/** The films one signal marks, in Python's query order. */
const marked = (
  db: Connection,
  list: typeof SignalList.Type,
  minimums: Weights['no_sad'],
  signal: SadSignal,
): Effect.Effect<string[], SqliteError> => {
  const tags = (list.tags ?? []).map((tag) => tag.toLowerCase())
  const items = list.wikidata ?? []
  const queries: Array<[string, SQLInputValue[]]> = [
    [
      `SELECT filme_id FROM tags_movielens WHERE tag IN (${marks(tags)}) AND usuarios >= ?`,
      [...tags, minimums[MIN_USERS[signal]]],
    ],
    [
      `SELECT filme_id FROM genoma WHERE tag IN (${marks(tags)}) AND relevancia >= ?`,
      [...tags, minimums.min_relevance],
    ],
  ]
  if (items.length > 0)
    queries.push([
      `SELECT filme_id FROM arestas WHERE predicado IN ('tema', 'baseado_em')
         AND entidade_id IN (${marks(items)})`,
      [...items],
    ])
  return Effect.forEach(queries, ([sql, params]) =>
    db.all(sql, ...params),
  ).pipe(
    Effect.map((results) => results.flat().map((row) => text(row, 'filme_id'))),
  )
}

const passes = (filmId: string, hasTags: boolean) =>
  pass([
    makeEvidence({
      person: null,
      filmId,
      text: hasTags
        ? 'nada triste: nenhuma tag de tristeza ou de tema pesado no MovieLens, nenhum tema pesado no Wikidata'
        : 'nada triste: o filme não tem tags no MovieLens, e o Wikidata não dá tema pesado',
      source: null,
      date: null,
      strength: guessStrength(),
      kind: 'guess',
      factId: null,
      base: 0,
    }),
  ])

const noSad: Constraint = {
  name: 'no_sad',
  toJson: () => ({}),
  stored: () => ({ name: 'no_sad' }),
  /** The films removed by signal. */
  result: (drops) => ({
    bySignal: Object.fromEntries(
      SIGNALS.map((signal) => [signal, drops.get(signal) ?? 0]),
    ),
  }),
  evaluate: (context, films) =>
    Effect.gen(function* () {
      const lists = yield* (yield* Environment).readConfig(
        'sadness',
        SadnessToml,
      )
      const found = new Map<string, SadSignal>()
      for (const signal of SIGNALS)
        for (const filmId of yield* marked(
          context.db,
          lists[signal],
          context.weights.no_sad,
          signal,
        ))
          if (films.has(filmId) && !found.has(filmId)) found.set(filmId, signal)
      const tagged = yield* context.db.all(
        'SELECT filme_id FROM tags_movielens UNION SELECT filme_id FROM genoma ORDER BY filme_id',
      )
      const withTags = new Set(tagged.map((row) => text(row, 'filme_id')))
      return new Map<string, Verdict>(
        [...films.keys()].map((filmId) => {
          const signal = found.get(filmId)
          return [
            filmId,
            signal === undefined
              ? passes(filmId, withTags.has(filmId))
              : drop(signal),
          ]
        }),
      )
    }),
}

export const noSadModule: ConstraintModule<NoSadRequest> = {
  name: 'no_sad',
  read: (request) => Effect.succeed(request.noSad ? noSad : undefined),
  label: () => 'nada triste',
}
