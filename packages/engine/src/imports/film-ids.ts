// A film an export names by its ids (Trakt #101, Simkl #299): by its IMDb
// id when the Catálogo has it; otherwise by its TMDB id, when exactly one
// film of the Catálogo has that id (Letterboxd's slugs table or Wikidata's
// P4947). Offline: nothing here asks TMDB.
import { Effect } from 'effect'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'

export type ResolvedBy = 'imdb' | 'tmdb'

export interface FilmIds {
  readonly imdb: string | null
  readonly tmdb: string | null
}

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
