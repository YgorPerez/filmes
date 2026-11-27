// A film an export names by its ids (Trakt #101, Simkl #299): by its IMDb
// id when the Catálogo has it; otherwise by its TMDB id, when exactly one
// film of the Catálogo has that id (Letterboxd's slugs table or Wikidata's
// P4947). Offline: nothing here asks TMDB.
import { Effect } from 'effect'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'

export type ResolvedBy = 'imdb' | 'tmdb'

/** The film's tconst and the id that gave it; null when none does. */
export type FilmResolution = readonly [string, ResolvedBy] | null

export interface FilmIds {
  readonly imdb: string | null
  readonly tmdb: string | null
}

/** A film of an import that the Catálogo does not have, as the imports
 * page lists it (#348): its title and year when the file gives them, and
 * the id it named, if any. */
export interface LeftOutFilm {
  readonly name: string | null
  readonly year: number | null
  readonly id: string | null
}

/** The left-out film of a file's names and ids: the IMDb id when it has
 * one, else the TMDB id. */
export const leftOutFilm = (film: {
  readonly name: string | null
  readonly year?: number | null
  readonly imdb: string | null
  readonly tmdb?: string | null
}): LeftOutFilm => ({
  name: film.name,
  year: film.year ?? null,
  id: film.imdb ?? film.tmdb ?? null,
})

/** Whether the database has Wikidata's table (a fixture may lack it). */
export const hasWikidata = (
  db: Connection,
): Effect.Effect<boolean, SqliteError> =>
  Effect.map(
    db.get("SELECT 1 FROM sqlite_master WHERE name = 'metadados_wikidata'"),
    (row) => row !== undefined,
  )

/** Whether the Catálogo has the film. */
export const inCatalog = (
  db: Connection,
  tconst: string,
): Effect.Effect<boolean, SqliteError> =>
  Effect.map(
    db.get('SELECT 1 FROM filmes WHERE id = ?', tconst),
    (row) => row !== undefined,
  )

/** The film's tconst and the id that gave it; null when neither does. */
export const resolveFilmIds = (
  db: Connection,
  film: FilmIds,
  wikidata: boolean,
): Effect.Effect<readonly [string, ResolvedBy] | null, SqliteError> =>
  Effect.gen(function* () {
    if (film.imdb && (yield* inCatalog(db, film.imdb)))
      return [film.imdb, 'imdb'] as const
    if (!film.tmdb) return null
    const ids = new Set(
      (yield* db.all(
        'SELECT f.id FROM slugs_letterboxd s JOIN filmes f ON f.id = s.imdb WHERE s.tmdb = ? ORDER BY f.id',
        film.tmdb,
      )).map((row) => String(row.id)),
    )
    if (wikidata)
      for (const row of yield* db.all(
        `SELECT f.id FROM metadados_wikidata t
         JOIN metadados_wikidata i ON i.item = t.item AND i.propriedade = 'P345'
         JOIN filmes f ON f.id = i.valor
         WHERE t.propriedade = 'P4947' AND t.valor = ?
         ORDER BY f.id`,
        film.tmdb,
      ))
        ids.add(String(row.id))
    const [only] = ids
    return ids.size === 1 && only !== undefined
      ? ([only, 'tmdb'] as const)
      : null
  })

/** Each row whose film the Catálogo has, with its tconst and the id that
 * gave it, and the films it does not have, each once: `key` tells two
 * rows of the same film apart, `resolve` finds the film, `unresolved` is
 * how the report shows one left out. */
export const resolveRows = <
  Row extends { readonly film: Film },
  Film,
  Unresolved,
>(
  db: Connection,
  rows: readonly Row[],
  how: {
    readonly key: (film: Film) => string
    readonly resolve: (
      film: Film,
      wikidata: boolean,
    ) => Effect.Effect<FilmResolution, SqliteError>
    readonly unresolved: (film: Film) => Unresolved
  },
): Effect.Effect<
  {
    found: (readonly [Row, readonly [string, ResolvedBy]])[]
    unresolved: Unresolved[]
  },
  SqliteError
> =>
  Effect.gen(function* () {
    const wikidata = yield* hasWikidata(db)
    const resolutions = new Map<string, FilmResolution>()
    const found: (readonly [Row, readonly [string, ResolvedBy]])[] = []
    const unresolved: Unresolved[] = []
    for (const row of rows) {
      const key = how.key(row.film)
      let resolution = resolutions.get(key)
      if (resolution === undefined) {
        resolution = yield* how.resolve(row.film, wikidata)
        resolutions.set(key, resolution)
        if (resolution === null) unresolved.push(how.unresolved(row.film))
      }
      if (resolution !== null) found.push([row, resolution])
    }
    return { found, unresolved }
  })
