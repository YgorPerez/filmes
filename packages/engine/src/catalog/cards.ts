// The public card of a film (#275): what anyone may see of it, with no
// Evidence, Fato or Nota prevista. The Link da Sessão shows it to the
// Presentes, who have no login: the cover, the titles, the year, the
// duration, the genres, the IMDb rating and the synopsis, the same as the
// Cartaz's card header.

import { Effect } from 'effect'
import type { EngineError } from '../runtime/EngineError.ts'
import type { Run } from '../runtime/Run.ts'
import { Tmdb } from '../sources/Tmdb.ts'
import { Sqlite, type SqliteError } from '../sqlite/Sqlite.ts'
import { catalogFilm } from '../recommendation/candidates.ts'
import { filmHeader } from '../recommendation/header.ts'
import { sessionDuration } from '../sessions/file.ts'
import { imdbRatingLabel } from '../billboard/model.ts'

export interface FilmCard {
  readonly id: string
  /** The Portuguese title, else the Catálogo's. */
  readonly title: string
  /** The Catálogo's title when the Portuguese one differs. */
  readonly originalTitle: string | null
  readonly year: number | null
  /** "1h44", or null. */
  readonly duration: string | null
  /** The IMDb genres in Portuguese. */
  readonly genres: ReadonlyArray<string>
  /** The TMDB poster at w342, or null. */
  readonly poster: string | null
  /** "7,5", or null. */
  readonly imdbRating: string | null
  /** The first sentence of the TMDB overview, or null. */
  readonly synopsis: string | null
}

/** The cards of `ids`, in that order; an id out of the Catálogo is left
 * out. Without a TMDB key, poster, Portuguese title and synopsis are null
 * and the source warns once. */
export const filmCards = (
  ids: ReadonlyArray<string>,
): Effect.Effect<
  ReadonlyArray<FilmCard>,
  EngineError | SqliteError,
  Sqlite | Tmdb | Run
> =>
  Effect.gen(function* () {
    const sqlite = yield* Sqlite
    return yield* sqlite.read((db) =>
      Effect.gen(function* () {
        const cards: FilmCard[] = []
        for (const id of ids) {
          const row = yield* catalogFilm(db, id)
          if (row === undefined) continue
          const header = yield* filmHeader(db, row)
          cards.push({
            id,
            title: header.titlePt || row.title,
            originalTitle:
              header.titlePt && header.titlePt !== row.title ? row.title : null,
            year: row.year,
            duration: row.runtimeMinutes
              ? sessionDuration(row.runtimeMinutes)
              : null,
            genres: header.genres,
            poster: header.poster?.replace('/w185/', '/w342/') ?? null,
            imdbRating:
              header.imdbRating === null
                ? null
                : imdbRatingLabel(header.imdbRating),
            synopsis: header.synopsis,
          })
        }
        return cards
      }),
    )
  })
