// The Recommendation run with only the Facts known before the cut
// (`avaliacao/offline.py`).
//
// TEMP views shadow the main tables on the evaluation's own read-only
// connection: an unqualified `notas` in the ranking's SQL reads the TEMP
// view, which keeps each measured Pessoa's Facts before her cut, minus the
// films held out, plus the training ratings of the MovieLens sample. The
// database file is never written.

import { Effect } from 'effect'
import { compareTuple } from '../compat/compare.ts'
import { HIGH_RATING } from '../evidence/ruler.ts'
import type { RecommendedFilm } from '../recommendation/recommend.ts'
import { rank } from '../recommendation/recommend.ts'
import type { CandidateSelection } from '../recommendation/candidates.ts'
import { IMDB_RATING_TABLE } from '../recommendation/signals/imdb-rating.ts'
import { Environment } from '../runtime/Environment.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import type { EngineServices } from '../runtime/Engine.ts'
import { Run } from '../runtime/Run.ts'
import type { Weights } from '../runtime/Weights.ts'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'
import { text } from '../sqlite/row.ts'
import {
  bucketOf,
  calibration,
  type Calibration,
  type Scored,
} from './calibration.ts'
import { meanSimilarity, type ListSimilarity } from './diversity.ts'
import type { MeasuredPerson } from './people.ts'
import {
  onTenScale,
  predictedRating,
  predictedRatingError,
  type PredictedRatingError,
} from './predicted-rating.ts'

/** The tables cut per Pessoa, with the column that names the film. */
const CUT_TABLES = [
  ['notas', 'filme_id'],
  ['ja_visto', 'filme_id'],
  ['declarados', 'alvo'],
  ['relatos', 'alvo'],
  ['vetos', 'alvo'],
] as const

/** `preparar`: the TEMP tables and views. */
export const prepareOffline = (
  db: Connection,
  people: ReadonlyArray<MeasuredPerson>,
  sample: ReadonlyArray<MeasuredPerson>,
): Effect.Effect<void, SqliteError> =>
  Effect.gen(function* () {
    yield* db.exec(`
      CREATE TEMP TABLE cortes (pessoa TEXT PRIMARY KEY, data TEXT);
      CREATE TEMP TABLE retidos (pessoa TEXT, filme_id TEXT, PRIMARY KEY (pessoa, filme_id));
    `)
    for (const p of people)
      yield* db.run('INSERT INTO cortes VALUES (?, ?)', p.person, p.cut)
    for (const p of people)
      for (const film of p.heldOut)
        yield* db.run('INSERT INTO retidos VALUES (?, ?)', p.person, film)
    yield* db.exec(`
      CREATE TEMP TABLE treino_movielens AS SELECT * FROM main.notas WHERE 0;
      CREATE INDEX temp.treino_por_pessoa ON treino_movielens(pessoa, filme_id);
    `)
    for (const measured of sample)
      for (const rating of measured.training)
        yield* db.run(
          `INSERT INTO treino_movielens (fato_id, pessoa, filme_id, nota, data, fonte, tipo)
           VALUES (?, ?, ?, ?, ?, ?, 'nota')`,
          ...rating,
        )
    for (const [table, target] of CUT_TABLES) {
      const movielens =
        table === 'notas' ? 'UNION ALL SELECT * FROM treino_movielens' : ''
      yield* db.exec(`
        CREATE TEMP VIEW ${table} AS
        SELECT f.* FROM main.${table} f
        JOIN cortes c ON c.pessoa = f.pessoa
        WHERE f.data < c.data AND NOT EXISTS (
            SELECT 1 FROM retidos r WHERE r.pessoa = f.pessoa AND r.filme_id = f.${target}
        )
        ${movielens}
      `)
    }
    const view = yield* db.get(
      "SELECT sql FROM main.sqlite_schema WHERE name = 'notas_vigentes'",
    )
    yield* db.exec(
      text(view!, 'sql').replace('CREATE VIEW', 'CREATE TEMP TABLE'),
    )
    yield* db.exec(
      'CREATE INDEX temp.vigentes_por_pessoa ON notas_vigentes(pessoa, filme_id)',
    )
  })

/** What one sample measured (`Medidas`, EN keys of the output). */
export interface Measures {
  readonly people: number
  readonly retrieved: number
  readonly heldOut4Plus: number
  readonly withEvidence: number
  readonly filmsTop5: number
  readonly recall50: number | null
  readonly coverageTop5: number | null
  /** Força calibration on the held-out films (#171). */
  readonly calibration: Calibration
  /** Predicted rating against the held-out Nota (#171; absent until
   * #174). */
  readonly predictedRatingError: PredictedRatingError
  /** Mean similarity of the pairs in each top 5, over the lists (#171);
   * lower is more diverse. */
  readonly similarityTop5: number | null
}

export interface MeasureOptions {
  /** Keeps each Pessoa's calibration. */
  readonly perPerson: boolean
  readonly similarity: ListSimilarity
}

/** `_sustentado`: a film with strong or moderate Evidence; the IMDb rating
 * line (#56) backs nothing. */
const backed = (film: RecommendedFilm): boolean =>
  [film.filmLines, ...Object.values(film.evidence)].some((lines) =>
    lines.some(
      (e) =>
        e.kind !== 'guess' &&
        (e.strength === 'strong' || e.strength === 'moderate') &&
        !(e.factId ?? '').startsWith(`${IMDB_RATING_TABLE}:`),
    ),
  )

/** The selection narrowed to the held-out films with a Nota that are still
 * Candidates, most votes first as in `prepareSelection`. It walks only
 * those films: the Catálogo is large, and this runs for every Pessoa of
 * every set of the grid. */
const heldOutSelection = (
  selection: CandidateSelection,
  rated: ReadonlyMap<string, number>,
): CandidateSelection => {
  const films = new Map(
    [...rated.keys()].flatMap((id) => {
      const film = selection.films.get(id)
      return film ? [[id, film] as const] : []
    }),
  )
  return {
    films,
    popular: [...films.values()]
      .sort((a, b) => compareTuple([-a.votes, a.id], [-b.votes, b.id]))
      .map((film) => film.id),
  }
}

/** `medir`: each Pessoa's top 50 on the day of her cut, with `weights`,
 * and the films she held out, scored on that same day; `advance` runs after
 * each Pessoa. */
export const measure = <R>(
  db: Connection,
  weights: Weights,
  people: ReadonlyArray<MeasuredPerson>,
  selection: CandidateSelection,
  advance: Effect.Effect<void, never, R>,
  options: MeasureOptions,
): Effect.Effect<
  Measures,
  EngineError | SqliteError,
  EngineServices | Run | R
> =>
  Effect.gen(function* () {
    const env = yield* Environment
    const run = yield* Run
    let measured = 0
    let retrieved = 0
    let heldOut4Plus = 0
    let withEvidence = 0
    let filmsTop5 = 0
    const scored: Scored[] = []
    const predicted: Array<readonly [number, number]> = []
    const similarities: Array<number | null> = []
    for (const person of people) {
      // The ranking sees the day of the cut and these weights; its warnings
      // are not the evaluation's (Python's were a list of its own).
      const ranked = (count: number, among: CandidateSelection) =>
        rank(db, { attendees: [person.person], count, selection: among }).pipe(
          Effect.map((recommendation) => recommendation.films),
          Effect.provideService(Environment, { ...env, weights }),
          Effect.provideService(Run, {
            ...run,
            today: person.cut,
            warn: () => Effect.void,
          }),
        )
      const films = yield* ranked(50, selection)
      const heldOut = heldOutSelection(selection, person.heldOutRatings)
      if (heldOut.films.size > 0)
        for (const film of yield* ranked(heldOut.films.size, heldOut)) {
          const rating = person.heldOutRatings.get(film.id)!
          scored.push({
            person: person.person,
            bucket: bucketOf(film, person.person),
            hit: rating >= HIGH_RATING,
          })
          const prediction = predictedRating(film, person.person)
          if (prediction !== null)
            predicted.push([prediction, onTenScale(rating)])
        }
      const top = films.slice(0, 5)
      similarities.push(yield* options.similarity(top.map((film) => film.id)))
      measured += 1
      retrieved += films.filter((film) => person.targets.has(film.id)).length
      heldOut4Plus += person.targets.size
      withEvidence += top.filter(backed).length
      filmsTop5 += top.length
      yield* advance
    }
    return {
      people: measured,
      retrieved,
      heldOut4Plus,
      withEvidence,
      filmsTop5,
      recall50: heldOut4Plus ? retrieved / heldOut4Plus : null,
      coverageTop5: filmsTop5 ? withEvidence / filmsTop5 : null,
      calibration: calibration(scored, options.perPerson),
      predictedRatingError: predictedRatingError(predicted),
      similarityTop5: meanSimilarity(similarities),
    }
  })
