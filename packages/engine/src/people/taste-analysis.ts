// The taste analysis on the Pessoa page (#404): the genres, directors,
// actors and decades she rates above her own median, each with the films
// and Notas behind it. A picture for her, as Meu gosto's `tasteSummary`:
// nothing here has a Força nor reaches a Motivo.

import { Effect } from 'effect'
import { genreInPortuguese } from '../catalog/genres.ts'
import type { Weights } from '../runtime/Weights.ts'
import type { Connection, Row, SqliteError } from '../sqlite/Sqlite.ts'
import { num, numOrNull, text, textOrNull } from '../sqlite/row.ts'

/** One film says nothing of a genre, a director or a decade. */
const MIN_FILMS = 2

/** How many of each the analysis names. */
const TOP = 5

/** How many films an item shows, her highest Notas first. */
const MAX_FILMS = 10

/** The films at her median added to each item when ranking: two films of
 * a 10 do not outrank twenty of a 9. */
const PRIOR = 2

/** The Notas of her Escala (#172): Tipo nota, in force, not pairwise. */
const RATED = `SELECT filme_id, nota FROM notas_vigentes
  WHERE pessoa = ?1 AND tipo = 'nota' AND NOT par_a_par`

const FILMS = `
SELECT r.filme_id, r.nota, f.titulo, f.ano
FROM (${RATED}) r LEFT JOIN filmes f ON f.id = r.filme_id
`

const GENRES = `
SELECT DISTINCT filme_id, genero AS chave, genero AS rotulo FROM generos_imdb
WHERE filme_id IN (SELECT filme_id FROM (${RATED}))
`

const DIRECTORS = `
SELECT DISTINCT a.filme_id, e.id AS chave, e.rotulo
FROM arestas a JOIN entidades e ON e.id = a.entidade_id
WHERE a.predicado = 'diretor'
  AND a.filme_id IN (SELECT filme_id FROM (${RATED}))
`

/** As the content path reads the cast: an actor of her first 3 IMDb
 * credits, or of a film IMDb credits nobody on. */
const ACTORS = `
SELECT DISTINCT a.filme_id, e.id AS chave, e.rotulo
FROM arestas a JOIN entidades e ON e.id = a.entidade_id
WHERE a.predicado = 'elenco'
  AND a.filme_id IN (SELECT filme_id FROM (${RATED}))
  AND (NOT EXISTS (
         SELECT 1 FROM elenco_principal_imdb p WHERE p.filme_id = a.filme_id
       ) OR EXISTS (
         SELECT 1 FROM elenco_principal_imdb p
         JOIN atores_imdb i ON i.imdb = p.ator_imdb
         WHERE p.filme_id = a.filme_id AND i.item = a.entidade_id
       ))
`

/** A film she rated, with her Nota of 0,5 to 5. */
export interface TasteFilm {
  readonly filmId: string
  readonly title: string | null
  readonly year: number | null
  readonly rating: number
}

/** A genre, director, actor or decade she rates above her median. */
export interface TasteItem {
  /** The IMDb genre, the entity's QID, or the decade's first year. */
  readonly key: string
  /** The genre in Portuguese, the entity's name, or the decade's first
   * year. */
  readonly label: string
  /** The mean of her Notas on its films, 0,5 to 5. */
  readonly mean: number
  /** How many of her films it has. */
  readonly count: number
  /** Its films, her highest Notas first, at most 10. */
  readonly films: ReadonlyArray<TasteFilm>
}

export interface TasteAnalysis {
  /** How many Notas her Escala has. */
  readonly ratings: number
  /** The median of those Notas, 0,5 to 5. */
  readonly median: number
  readonly genres: ReadonlyArray<TasteItem>
  readonly directors: ReadonlyArray<TasteItem>
  readonly actors: ReadonlyArray<TasteItem>
  readonly decades: ReadonlyArray<TasteItem>
}

const median = (sorted: ReadonlyArray<number>): number => {
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2
}

const byRating = (a: TasteFilm, b: TasteFilm) =>
  b.rating - a.rating ||
  (a.title ?? a.filmId).localeCompare(b.title ?? b.filmId)

/** The items of `links` (film, key, label) above `middle`, the furthest
 * above first. */
const above = (
  links: ReadonlyArray<readonly [string, string, string]>,
  films: ReadonlyMap<string, TasteFilm>,
  middle: number,
): ReadonlyArray<TasteItem> => {
  const groups = new Map<string, { label: string; films: TasteFilm[] }>()
  for (const [film, key, label] of links) {
    const rated = films.get(film)
    if (rated === undefined) continue
    const group = groups.get(key) ?? { label, films: [] }
    group.films.push(rated)
    groups.set(key, group)
  }
  return [...groups]
    .filter(([, group]) => group.films.length >= MIN_FILMS)
    .map(([key, group]) => {
      const sum = group.films.reduce((total, f) => total + f.rating, 0)
      const count = group.films.length
      return {
        item: {
          key,
          label: group.label,
          mean: sum / count,
          count,
          films: group.films.toSorted(byRating).slice(0, MAX_FILMS),
        },
        excess: (sum - count * middle) / (count + PRIOR),
      }
    })
    .filter(({ excess }) => excess > 0)
    .toSorted(
      (a, b) =>
        b.excess - a.excess ||
        b.item.count - a.item.count ||
        a.item.label.localeCompare(b.item.label),
    )
    .slice(0, TOP)
    .map(({ item }) => item)
}

const links = (
  rows: ReadonlyArray<Row>,
  label: (row: Row) => string = (row) => text(row, 'rotulo'),
) =>
  rows.map(
    (row) => [text(row, 'filme_id'), text(row, 'chave'), label(row)] as const,
  )

/** Her taste analysis, or null below `[rating_percentile] min_ratings`
 * Notas: under her own Escala, her median says little. */
export const personTasteAnalysis = (
  db: Connection,
  person: string,
  weights: Pick<Weights, 'rating_percentile'>,
): Effect.Effect<TasteAnalysis | null, SqliteError> =>
  Effect.gen(function* () {
    const rows = yield* db.all(FILMS, person)
    if (
      rows.length === 0 ||
      rows.length < weights.rating_percentile.min_ratings
    )
      return null
    const films = new Map(
      rows.map((row): [string, TasteFilm] => {
        const filmId = text(row, 'filme_id')
        return [
          filmId,
          {
            filmId,
            title: textOrNull(row, 'titulo'),
            year: numOrNull(row, 'ano'),
            rating: num(row, 'nota'),
          },
        ]
      }),
    )
    const middle = median(
      [...films.values()].map((f) => f.rating).toSorted((a, b) => a - b),
    )
    const decades = [...films.values()].flatMap((f) => {
      if (f.year === null) return []
      const decade = String(Math.floor(f.year / 10) * 10)
      return [[f.filmId, decade, decade] as const]
    })
    return {
      ratings: films.size,
      median: middle,
      genres: above(
        links(yield* db.all(GENRES, person), (row) =>
          genreInPortuguese(text(row, 'rotulo')),
        ),
        films,
        middle,
      ),
      directors: above(links(yield* db.all(DIRECTORS, person)), films, middle),
      actors: above(links(yield* db.all(ACTORS, person)), films, middle),
      decades: above(decades, films, middle),
    }
  })
