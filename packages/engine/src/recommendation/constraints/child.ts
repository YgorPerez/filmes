// Tem criança [child]: passes the film whose rating is at most the age of
// the youngest child. "Tem criança" with no age holds as L
// (`restricoes/crianca.py`).
//
// The chain (#15): IMDb's isAdult removes the film; else ClassInd holds;
// else the highest rating among the other systems, converted
// (`faixas_etarias`); else OMDb's `Rated`, asked only for the films that
// would reach the top `on_demand_reach` and converted by the MPA row. With
// no rating at all, the film is out.
//
// The child is not a Pessoa and has no stored age: it exists only in this
// request.

import { Effect } from 'effect'
import {
  AGE_SCALE,
  CLASSIND,
  convertRating,
  MPA,
  ratingAge,
  SYSTEM_ORDER,
} from '../../catalog/age-rating.ts'
import { requestLine } from '../../evidence/Evidence.ts'
import { engineError } from '../../runtime/EngineError.ts'
import { Omdb, OMDB_NAME } from '../../sources/Omdb.ts'
import { num, text } from '../../sqlite/row.ts'
import type { Connection, SqliteError } from '../../sqlite/Sqlite.ts'
import type { Candidate } from '../candidates.ts'
import {
  drop,
  filmsJson,
  pass,
  type Constraint,
  type ConstraintModule,
  type Drop,
  type Pass,
  type Verdict,
} from '../constraints.ts'

const MAX_CHILD_AGE = 17

export interface ChildRequest {
  /** `--crianca [IDADE]`: the youngest child's age; 0 when given with no
   * age. */
  readonly child?: number
}

interface RatingRow {
  readonly factId: string
  readonly rating: string
  readonly age: number
  readonly system: string
  readonly property: string
  readonly label: string
  readonly converted: boolean
  readonly source: string
  readonly date: string
}

/** ClassInd beats any other system; among the others, the highest rating
 * holds; on a tie, the first system in Python's order. */
const beats = (next: RatingRow, current: RatingRow): boolean => {
  const nextClassInd = next.property === CLASSIND
  const currentClassInd = current.property === CLASSIND
  if (nextClassInd !== currentClassInd) return nextClassInd
  if (next.age !== current.age) return next.age > current.age
  return (
    SYSTEM_ORDER.indexOf(next.system) < SYSTEM_ORDER.indexOf(current.system)
  )
}

/** A rating to judge, with the Fact it comes from. */
interface Judged {
  readonly rating: string
  readonly system: string
  readonly label: string
  readonly converted: boolean
  readonly source: string
  readonly date: string
  readonly factId: string
}

const judge = (age: number, filmId: string, judged: Judged): Pass | Drop => {
  const { rating, system, label, converted } = judged
  if (ratingAge(rating) > age) return drop()
  // Some systems already put their name in the label ("FSK 6"); others do
  // not ("12A" of the BBFC).
  const fullLabel = label.startsWith(`${system} `)
    ? label
    : `${system} ${label}`
  const from = converted ? `${fullLabel} convertida` : system
  return pass([
    requestLine(
      filmId,
      `classificação ${rating} (${from})`,
      judged.source,
      judged.date,
      judged.factId,
    ),
  ])
}

/** Film → the rating that holds among its stored ones. */
const readRatings = (
  db: Connection,
  films: ReadonlyMap<string, Candidate>,
): Effect.Effect<ReadonlyMap<string, RatingRow>, SqliteError> =>
  Effect.gen(function* () {
    const ratings = new Map<string, RatingRow>()
    for (const row of yield* db.all(
      `SELECT * FROM faixas_etarias
             WHERE filme_id IN (SELECT value FROM json_each(?))
             ORDER BY filme_id, fato_id`,
      filmsJson(films),
    )) {
      const next: RatingRow = {
        factId: text(row, 'fato_id'),
        rating: text(row, 'faixa'),
        age: num(row, 'idade'),
        system: text(row, 'sistema'),
        property: text(row, 'propriedade'),
        label: text(row, 'rotulo'),
        converted: num(row, 'convertida') !== 0,
        source: text(row, 'fonte'),
        date: text(row, 'data'),
      }
      const filmId = text(row, 'filme_id')
      const current = ratings.get(filmId)
      if (current === undefined || beats(next, current))
        ratings.set(filmId, next)
    }
    return ratings
  })

const child = (age: number): Constraint => {
  const maxRating = AGE_SCALE.filter((r) => ratingAge(r) <= age).at(-1)

  return {
    name: 'child',
    toJson: () => ({ age, maxAgeRating: maxRating }),
    stored: () => ({ name: 'child', age, max_age_rating: maxRating }),
    result: () => ({}),
    evaluate: (context, films) =>
      Effect.gen(function* () {
        // `adultos` is a few hundred rows: read whole, it costs less than
        // building the `json_each` list.
        const adults = new Set(
          (yield* context.db.all('SELECT filme_id FROM adultos')).map((row) =>
            text(row, 'filme_id'),
          ),
        )
        const ratings = yield* readRatings(context.db, films)
        return new Map<string, Verdict>(
          [...films.keys()].map((filmId) => {
            if (adults.has(filmId)) return [filmId, drop()]
            const row = ratings.get(filmId)
            if (row === undefined) return [filmId, 'pending']
            return [
              filmId,
              judge(age, filmId, {
                rating: row.rating,
                system: row.system,
                label: row.label,
                converted: row.converted,
                source: `${row.source} ${row.property}`,
                date: row.date,
                factId: row.factId,
              }),
            ]
          }),
        )
      }),
    resolve: (_, film, consult) =>
      Effect.gen(function* () {
        if (!consult) return drop()
        const answer = yield* (yield* Omdb).ageRating(film.id)
        if (answer === undefined) return drop()
        const converted = convertRating(MPA, answer.rated)
        if (converted === undefined) return drop()
        const [system, rating] = converted
        return judge(age, film.id, {
          rating,
          system,
          label: answer.rated,
          converted: true,
          source: OMDB_NAME,
          date: answer.date,
          factId: answer.factId,
        })
      }),
  }
}

export const childModule: ConstraintModule<ChildRequest> = {
  name: 'child',
  read: ({ child: age }) =>
    Effect.gen(function* () {
      if (age === undefined) return undefined
      if (!(age >= 0 && age <= MAX_CHILD_AGE))
        return yield* engineError(
          'invalid_usage',
          `--crianca: idade de 0 a ${MAX_CHILD_AGE} (sem idade vale L)`,
        )
      return child(age)
    }),
  label: (stored) => {
    const age = stored['age']
    return typeof age === 'number' && age !== 0
      ? `com criança de ${age} anos`
      : 'com criança'
  },
}
