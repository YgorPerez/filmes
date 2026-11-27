// Catálogo search: a name, as the Dono types it, to the IDs the other
// operations take (#128). Films come with their year and directors, an
// entity (a person, a genre, a series) with its links and the films it is
// best known for, so two "Lia Moura" can be told apart. Read-only, and open
// to any Dono: `consult` is the admin's.
//
// Matching ignores case, accents and punctuation (`searchKey`, also the SQL
// function `search_key`). The closest names come first: the whole name, then
// a name that starts with the query, then a word that does, then anywhere;
// among equals, the film with more IMDb votes, the entity with more films.

import { Effect } from 'effect'
import type { Link } from '../evidence/strength.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { num, numOrNull, text } from '../sqlite/row.ts'
import {
  Sqlite,
  type Connection,
  type Row,
  type SqliteError,
} from '../sqlite/Sqlite.ts'
import { LINK_PREDICATE } from '../sqlite/vocabulary.ts'
import { genreInPortuguese, WIKIDATA_GENRE } from './genres.ts'
import { searchKey } from './search-key.ts'

export const SEARCH_KINDS = ['film', 'person', 'genre', 'series'] as const
export type SearchKind = (typeof SEARCH_KINDS)[number]

/** Matches per kind when the request names no limit, and the most it may. */
export const SEARCH_LIMIT = 8
export const SEARCH_LIMIT_MAX = 30
/** The shortest query, folded, that is searched. */
export const SEARCH_MIN_LENGTH = 2

export interface CatalogSearchRequest {
  readonly query: string
  /** Every kind when absent or empty. */
  readonly kinds?: ReadonlyArray<SearchKind>
  /** Per kind, 1 to `SEARCH_LIMIT_MAX`. */
  readonly limit?: number
}

export interface FilmRef {
  readonly id: string
  readonly title: string
  readonly year: number | null
}

export interface FilmMatch extends FilmRef {
  readonly votes: number
  readonly rating: number | null
  /** The directors' labels, in name order. */
  readonly directors: ReadonlyArray<string>
}

export interface EntityMatch {
  readonly id: string
  readonly label: string
  /** The content links it has in the Catálogo (an Ajuste's or a Declarado's
   * link), in `LINK_PREDICATE` order. */
  readonly links: ReadonlyArray<Link>
  /** How many films it is linked to through them. */
  readonly filmCount: number
  /** Its two films with the most votes. */
  readonly knownFor: ReadonlyArray<FilmRef>
}

export interface CatalogSearch {
  readonly query: string
  readonly films: ReadonlyArray<FilmMatch>
  readonly people: ReadonlyArray<EntityMatch>
  readonly genres: ReadonlyArray<EntityMatch>
  readonly series: ReadonlyArray<EntityMatch>
}

const ENTITY_LINKS: Readonly<Record<Exclude<SearchKind, 'film'>, Link[]>> = {
  person: ['director', 'writer', 'cast'],
  genre: ['genre'],
  series: ['series'],
}

const LINK_OF: ReadonlyMap<string, Link> = new Map(
  Object.entries(LINK_PREDICATE).map(([link, p]) => [p, link as Link]),
)

/** "Título (2001)": the title and the year apart. */
const WITH_YEAR = /^(.*\S)\s*\((\d{4})\)$/u
const FILM_ID = /^tt\d+$/u
const ENTITY_ID = /^Q\d+$/u

/** 0 the whole name, 1 its start, 2 a word's start, 3 anywhere. */
const RANK = `CASE WHEN k = ?1 THEN 0 WHEN instr(k, ?1) = 1 THEN 1
  WHEN instr(' ' || k, ' ' || ?1) > 0 THEN 2 ELSE 3 END`

const filmRef = (row: Row): FilmRef => ({
  id: text(row, 'id'),
  title: text(row, 'titulo'),
  year: numOrNull(row, 'ano'),
})

const directorsOf = (db: Connection, film: string) =>
  db
    .all(
      `SELECT e.rotulo FROM arestas a JOIN entidades e ON e.id = a.entidade_id
       WHERE a.filme_id = ? AND a.predicado = 'diretor' ORDER BY e.rotulo, e.id`,
      film,
    )
    .pipe(Effect.map((rows) => rows.map((row) => text(row, 'rotulo'))))

const searchFilms = (
  db: Connection,
  query: string,
  limit: number,
): Effect.Effect<FilmMatch[], SqliteError> =>
  Effect.gen(function* () {
    const trimmed = query.trim()
    const matched = WITH_YEAR.exec(trimmed)
    const year = matched ? Number(matched[2]) : null
    const key = searchKey(matched ? String(matched[1]) : trimmed)
    const rows = FILM_ID.test(trimmed)
      ? yield* db.all(
          'SELECT id, titulo, ano, votos, nota_imdb FROM filmes WHERE id = ?',
          trimmed,
        )
      : yield* db.all(
          `SELECT id, titulo, ano, votos, nota_imdb FROM (
             SELECT *, search_key(titulo) AS k FROM filmes
             WHERE instr(search_key(titulo), ?1) > 0
               AND (?2 IS NULL OR ano = ?2))
           ORDER BY ${RANK}, votos DESC, id LIMIT ?3`,
          key,
          year,
          limit,
        )
    return yield* Effect.forEach(rows, (row) =>
      directorsOf(db, text(row, 'id')).pipe(
        Effect.map((directors): FilmMatch => ({
          ...filmRef(row),
          votes: num(row, 'votos'),
          rating: numOrNull(row, 'nota_imdb'),
          directors,
        })),
      ),
    )
  })

/** The genre entities an IMDb genre's name finds (#347): Meu gosto names
 * the IMDb genres ("Crime"), and a Veto or a Declarado takes the Wikidata
 * entity `WIKIDATA_GENRE` ties each to ("filme policial"). Each as
 * [QID, the name's key], for the rank. */
const imdbGenreAliases = (key: string): ReadonlyArray<[string, string]> =>
  [...WIKIDATA_GENRE].flatMap(([imdb, entity]) => {
    const name = searchKey(genreInPortuguese(imdb))
    return name.includes(key) ? [[entity, name] as [string, string]] : []
  })

const searchEntities = (
  db: Connection,
  query: string,
  kind: Exclude<SearchKind, 'film'>,
  limit: number,
): Effect.Effect<EntityMatch[], SqliteError> =>
  Effect.gen(function* () {
    const trimmed = query.trim()
    const predicates = JSON.stringify(
      ENTITY_LINKS[kind].map((link) => LINK_PREDICATE[link]),
    )
    const linked = `SELECT count(DISTINCT a.filme_id) FROM arestas a
      WHERE a.entidade_id = e.id
        AND a.predicado IN (SELECT value FROM json_each(?2))`
    const rows = ENTITY_ID.test(trimmed)
      ? yield* db.all(
          `SELECT e.id, e.rotulo, (${linked}) AS n FROM entidades e
           WHERE e.id = ?1 AND (${linked}) > 0`,
          trimmed,
          predicates,
        )
      : yield* db.all(
          // A label that has the query ranks by itself; an entity only an
          // IMDb genre's name finds, by that name.
          `SELECT id, rotulo, n FROM (
             SELECT e.id, e.rotulo, (${linked}) AS n,
               CASE WHEN instr(search_key(e.rotulo), ?1) > 0
                 THEN search_key(e.rotulo)
                 ELSE (SELECT value ->> 1 FROM json_each(?4)
                       WHERE value ->> 0 = e.id) END AS k
             FROM entidades e WHERE instr(search_key(e.rotulo), ?1) > 0
               OR e.id IN (SELECT value ->> 0 FROM json_each(?4)))
           WHERE n > 0 ORDER BY ${RANK}, n DESC, id LIMIT ?3`,
          searchKey(trimmed),
          predicates,
          limit,
          JSON.stringify(
            kind === 'genre' ? imdbGenreAliases(searchKey(trimmed)) : [],
          ),
        )
    return yield* Effect.forEach(rows, (row) =>
      Effect.gen(function* () {
        const id = text(row, 'id')
        const links = yield* db.all(
          'SELECT DISTINCT predicado FROM arestas WHERE entidade_id = ?',
          id,
        )
        const known = yield* db.all(
          `SELECT DISTINCT f.id, f.titulo, f.ano, f.votos FROM arestas a
           JOIN filmes f ON f.id = a.filme_id
           WHERE a.entidade_id = ?1
             AND a.predicado IN (SELECT value FROM json_each(?2))
           ORDER BY f.votos DESC, f.id LIMIT 2`,
          id,
          predicates,
        )
        const has = new Set(links.map((l) => LINK_OF.get(text(l, 'predicado'))))
        return {
          id,
          label: text(row, 'rotulo'),
          links: (Object.keys(LINK_PREDICATE) as Link[]).filter((link) =>
            has.has(link),
          ),
          filmCount: num(row, 'n'),
          knownFor: known.map(filmRef),
        }
      }),
    )
  })

/** Searches the Catálogo for `query` (a name, "Título (ano)", a tt… or a
 * Q…). Fails `invalid_usage` on a query too short or a limit out of range. */
export const searchCatalog = (
  request: CatalogSearchRequest,
): Effect.Effect<CatalogSearch, EngineError | SqliteError, Sqlite> =>
  Effect.gen(function* () {
    const query = request.query.trim()
    if (searchKey(query).length < SEARCH_MIN_LENGTH)
      return yield* engineError(
        'invalid_usage',
        `buscar precisa de pelo menos ${SEARCH_MIN_LENGTH} letras ou números`,
      )
    const limit = request.limit ?? SEARCH_LIMIT
    if (!Number.isInteger(limit) || limit < 1 || limit > SEARCH_LIMIT_MAX)
      return yield* engineError(
        'invalid_usage',
        `o limite da busca vai de 1 a ${SEARCH_LIMIT_MAX}`,
      )
    const kinds = new Set<SearchKind>(
      request.kinds === undefined || request.kinds.length === 0
        ? SEARCH_KINDS
        : request.kinds,
    )
    const sqlite = yield* Sqlite
    return yield* sqlite.read((db) =>
      Effect.gen(function* () {
        const entities = (kind: Exclude<SearchKind, 'film'>) =>
          kinds.has(kind)
            ? searchEntities(db, query, kind, limit)
            : Effect.succeed([])
        return {
          query,
          films: kinds.has('film') ? yield* searchFilms(db, query, limit) : [],
          people: yield* entities('person'),
          genres: yield* entities('genre'),
          series: yield* entities('series'),
        }
      }),
    )
  })
