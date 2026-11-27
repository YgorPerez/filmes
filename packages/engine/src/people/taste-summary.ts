// Meu gosto's opening ficha (#274): what the filmes reads in a Pessoa's
// Notas, in one look. The genres and the directors of the films she gave a
// high Nota (8 or more of 10), the three she has most of each. A picture
// for her, not Evidence: nothing here has a Força nor reaches a Motivo.

import { Effect } from 'effect'
import { genreInPortuguese } from '../catalog/genres.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import { text } from '../sqlite/row.ts'
import { Sqlite, type SqliteError } from '../sqlite/Sqlite.ts'
import { resolvePerson } from './people.ts'

/** A Nota from 4 of 5 (8 of 10) on counts as liked. */
const LIKED = 4

/** How many of each the summary names. */
const TOP = 3

export interface TasteSummaryRequest {
  /** Slug, name or alias; "dono" is the Dono. */
  readonly person: string
}

export interface TasteSummary {
  readonly person: string
  /** How many films she gave a high Nota. */
  readonly liked: number
  /** The IMDb genres of those films, in Portuguese, most first. */
  readonly genres: ReadonlyArray<string>
  /** Their directors, most first; only one with two films or more. */
  readonly directors: ReadonlyArray<string>
}

/** The Pessoa's taste in one look. Fails `unknown_person` on a name of no
 * one. */
export const tasteSummary = (
  request: TasteSummaryRequest,
): Effect.Effect<
  TasteSummary,
  EngineError | SqliteError,
  Sqlite | Environment
> =>
  Effect.gen(function* () {
    const person = yield* resolvePerson(request.person)
    const sqlite = yield* Sqlite
    return yield* sqlite.read((db) =>
      Effect.gen(function* () {
        const liked = `SELECT DISTINCT filme_id FROM notas
                       WHERE pessoa = ? AND tipo = 'nota' AND nota >= ${LIKED}`
        const count = yield* db.get(
          `SELECT COUNT(*) AS n FROM (${liked})`,
          person.slug,
        )
        const genres = yield* db.all(
          `SELECT genero, COUNT(*) AS n FROM generos_imdb
           WHERE filme_id IN (${liked})
           GROUP BY genero ORDER BY n DESC, genero LIMIT ${TOP}`,
          person.slug,
        )
        const directors = yield* db.all(
          `SELECT e.rotulo, COUNT(DISTINCT a.filme_id) AS n
           FROM arestas a JOIN entidades e ON e.id = a.entidade_id
           WHERE a.predicado = 'diretor' AND a.filme_id IN (${liked})
           GROUP BY e.id HAVING n >= 2 ORDER BY n DESC, e.rotulo LIMIT ${TOP}`,
          person.slug,
        )
        return {
          person: person.slug,
          liked: Number(count?.n ?? 0),
          genres: genres.map((row) => genreInPortuguese(text(row, 'genero'))),
          directors: directors.map((row) => text(row, 'rotulo')),
        }
      }),
    )
  })
