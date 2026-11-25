// The rating screen (#144), for a Dono with no Letterboxd nor Trakt: the
// Fila de Notas she rates from, and the Notas she gives there, written to
// her file in one commit when she is done.
//
// The Fila is the films with the most IMDb votes she has not seen, varied:
// the next film is the most voted one of another decade than the last, and
// of a genre not among the last two (an IMDb genre; a film without one
// varies only by decade). When nothing varies, the most voted goes next.

import { Effect } from 'effect'
import { genreInPortuguese } from '../catalog/genres.ts'
import type { FilmRef } from '../catalog/search.ts'
import { readRating } from '../data/rating.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import { numOrNull, text } from '../sqlite/row.ts'
import { Sqlite, type Connection, type SqliteError } from '../sqlite/Sqlite.ts'
import {
  dateOf,
  invalidUsage,
  required,
  savePersonAndSync,
  writePerson,
  type PersonServices,
  type PersonWriteError,
  type WrittenBy,
} from './actions.ts'
import { targetLabel } from './facts.ts'
import { resolvePerson } from './people.ts'
import { addItem, type Person } from './Person.ts'

/** Films in the Fila when the request names no limit, and the most it may. */
export const RATING_QUEUE_LIMIT = 50
export const RATING_QUEUE_LIMIT_MAX = 200

/** How many of the most voted films the variety picks from, per film
 * asked. */
const POOL_FACTOR = 4

export interface RatingQueueRequest {
  /** Slug, name or alias; "dono" is the Dono. */
  readonly person: string
  /** 1 to `RATING_QUEUE_LIMIT_MAX`. */
  readonly limit?: number
}

export interface QueueFilm extends FilmRef {
  /** Its IMDb genres, in Portuguese, in the IMDb's order. */
  readonly genres: ReadonlyArray<string>
}

export interface RatingQueue {
  readonly person: string
  readonly films: ReadonlyArray<QueueFilm>
}

type PoolFilm = FilmRef & { readonly genre: string | null }

const decadeOf = (film: PoolFilm) =>
  film.year === null ? null : Math.floor(film.year / 10)

/** The pool reordered for variety (the module's comment). */
function varied(pool: readonly PoolFilm[], limit: number): PoolFilm[] {
  const left = [...pool]
  const order: PoolFilm[] = []
  while (order.length < limit && left.length > 0) {
    const last = order.at(-1)
    const recentGenres = order
      .slice(-2)
      .map((f) => f.genre)
      .filter((g) => g !== null)
    const otherDecade = (f: PoolFilm) =>
      last === undefined ||
      decadeOf(f) === null ||
      decadeOf(f) !== decadeOf(last)
    const otherGenre = (f: PoolFilm) =>
      f.genre === null || !recentGenres.includes(f.genre)
    const index = [
      left.findIndex((f) => otherDecade(f) && otherGenre(f)),
      left.findIndex(otherDecade),
      0,
    ].find((i) => i !== -1) as number
    order.push(...left.splice(index, 1))
  }
  return order
}

const genresOf = (
  db: Connection,
  ids: readonly string[],
): Effect.Effect<Map<string, string[]>, SqliteError> =>
  Effect.map(
    db.all(
      `SELECT filme_id, genero FROM generos_imdb WHERE filme_id IN (${ids.map(() => '?').join(', ')}) ORDER BY filme_id, ordem`,
      ...ids,
    ),
    (rows) => {
      const genres = new Map<string, string[]>()
      for (const row of rows) {
        const id = text(row, 'filme_id')
        genres.set(id, [
          ...(genres.get(id) ?? []),
          genreInPortuguese(text(row, 'genero')),
        ])
      }
      return genres
    },
  )

/** The Pessoa's Fila de Notas. Fails `invalid_usage` on a limit out of
 * range, `unknown_person` on a name of no one. */
export const ratingQueue = (
  request: RatingQueueRequest,
): Effect.Effect<
  RatingQueue,
  EngineError | SqliteError,
  Sqlite | Environment
> =>
  Effect.gen(function* () {
    const limit = request.limit ?? RATING_QUEUE_LIMIT
    if (!Number.isInteger(limit) || limit < 1 || limit > RATING_QUEUE_LIMIT_MAX)
      return yield* engineError(
        'invalid_usage',
        `o limite da fila vai de 1 a ${RATING_QUEUE_LIMIT_MAX}`,
      )
    const person = yield* resolvePerson(request.person)
    const sqlite = yield* Sqlite
    return yield* sqlite.read((db) =>
      Effect.gen(function* () {
        const rows = yield* db.all(
          `SELECT f.id, f.titulo, f.ano,
                  (SELECT genero FROM generos_imdb g WHERE g.filme_id = f.id AND g.ordem = 1) AS genero
           FROM filmes f
           WHERE f.id NOT IN (SELECT filme_id FROM ja_vistos WHERE pessoa = ?)
           ORDER BY f.votos DESC, f.id
           LIMIT ?`,
          person.slug,
          limit * POOL_FACTOR,
        )
        const order = varied(
          rows.map((row) => ({
            id: text(row, 'id'),
            title: text(row, 'titulo'),
            year: numOrNull(row, 'ano'),
            genre: row.genero === null ? null : text(row, 'genero'),
          })),
          limit,
        )
        const genres =
          order.length === 0
            ? new Map<string, string[]>()
            : yield* genresOf(
                db,
                order.map((f) => f.id),
              )
        return {
          person: person.slug,
          films: order.map(({ id, title, year }) => ({
            id,
            title,
            year,
            genres: genres.get(id) ?? [],
          })),
        }
      }),
    )
  })

/** Where a Nota of the rating screen comes from. */
export const RATING_SCREEN_SOURCE = 'notas no site'

export interface GivenRating {
  /** The film's Catalog id (tt...). */
  readonly film: string
  /** 1 to 10, as in the Cartaz's Já vi. */
  readonly rating: number
}

export interface PersonRateInput extends WrittenBy {
  /** Slug, name or alias; "dono" is the Dono. */
  readonly person: string
  /** At least one; a film given twice keeps the last. */
  readonly ratings: ReadonlyArray<GivenRating>
}

export interface PersonRateResult {
  readonly person: string
  /** How many Notas went into her file; one she had already is not new. */
  readonly added: number
}

/** Records the Notas the Pessoa gave on the rating screen, each a Já visto
 * with its Nota of 1 to 10, in one commit. A Nota off the scale or a film
 * out of the Catálogo refuses them all. */
export const personRate = (
  input: PersonRateInput,
): Effect.Effect<PersonRateResult, PersonWriteError, PersonServices> =>
  Effect.gen(function* () {
    if (input.ratings.length === 0)
      return yield* invalidUsage('nenhuma nota para gravar')
    const ratings = new Map<string, number>()
    for (const { film, rating } of input.ratings) {
      if (!film.startsWith('tt'))
        return yield* invalidUsage(`não é um ID de filme (tt...): ${film}`)
      ratings.set(film, (yield* readRating(`${rating}/10`)).rating)
    }
    return yield* writePerson(
      input,
      `pessoa notas ${input.person}: ${ratings.size}`,
      (db) =>
        Effect.gen(function* () {
          let person: Person = yield* resolvePerson(input.person)
          const date = yield* dateOf(undefined)
          let added = 0
          for (const [film, rating] of ratings) {
            const label = yield* targetLabel(yield* required(db), film)
            const result = yield* addItem(person, 'seen', {
              date,
              source: RATING_SCREEN_SOURCE,
              target: film,
              label,
              rating,
            })
            person = result.person
            if (result.added) added += 1
          }
          if (added > 0) yield* savePersonAndSync(db, person)
          return { person: person.slug, added }
        }),
    )
  })
