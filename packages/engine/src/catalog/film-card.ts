// What a screen shows so a Pessoa knows a film before she rates it (#274):
// the Catalog's year, runtime and directors, and from one TMDB lookup in
// pt-BR the poster, the Portuguese title and the synopsis. Without a key or
// on a failure those three are null and the source warns once, as on the
// Cartaz's card header.

import { Effect } from 'effect'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import type { Run } from '../runtime/Run.ts'
import { Tmdb, TMDB_ATTRIBUTION } from '../sources/Tmdb.ts'
import { numOrNull, text } from '../sqlite/row.ts'
import { Sqlite, type SqliteError } from '../sqlite/Sqlite.ts'

export interface FilmCardRequest {
  /** The film's Catalog id (tt...). */
  readonly film: string
}

export interface FilmCard {
  readonly id: string
  /** The Catalog's title. */
  readonly title: string
  /** The Brazilian title TMDB gives, when it differs from the Catalog's. */
  readonly titlePt: string | null
  readonly year: number | null
  /** In minutes. */
  readonly runtime: number | null
  /** The directors' labels, in name order. */
  readonly directors: ReadonlyArray<string>
  /** The poster's URL. */
  readonly poster: string | null
  /** TMDB's synopsis, whole: the screen clamps it. */
  readonly synopsis: string | null
  /** TMDB's notice, when anything came from it. */
  readonly attributions: ReadonlyArray<typeof TMDB_ATTRIBUTION>
}

/** The film's card. Fails `unknown_target` on an id out of the Catalog. */
export const filmCard = (
  request: FilmCardRequest,
): Effect.Effect<
  FilmCard,
  EngineError | SqliteError,
  Sqlite | Environment | Tmdb | Run
> =>
  Effect.gen(function* () {
    const sqlite = yield* Sqlite
    const found = yield* sqlite.read((db) =>
      Effect.gen(function* () {
        const row = yield* db.get(
          'SELECT id, titulo, ano, duracao_min FROM filmes WHERE id = ?',
          request.film,
        )
        if (row === undefined) return undefined
        const directors = yield* db.all(
          `SELECT e.rotulo FROM arestas a JOIN entidades e ON e.id = a.entidade_id
           WHERE a.filme_id = ? AND a.predicado = 'diretor' ORDER BY e.rotulo, e.id`,
          request.film,
        )
        return {
          id: text(row, 'id'),
          title: text(row, 'titulo'),
          year: numOrNull(row, 'ano'),
          runtime: numOrNull(row, 'duracao_min'),
          directors: directors.map((d) => text(d, 'rotulo')),
        }
      }),
    )
    if (found === undefined)
      return yield* engineError(
        'unknown_target',
        `${request.film} não está no Catálogo`,
      )
    const card = yield* (yield* Tmdb).card(found.id)
    const fromTmdb =
      card.poster !== null || card.titlePt !== null || card.overview !== null
    return {
      ...found,
      titlePt: card.titlePt === found.title ? null : card.titlePt,
      poster: card.poster,
      synopsis: card.overview,
      attributions: fromTmdb ? [TMDB_ATTRIBUTION] : [],
    }
  })
