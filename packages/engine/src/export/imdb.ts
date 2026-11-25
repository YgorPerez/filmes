// A Pessoa's Notas in another service's file (`filmes/exportar/imdb.py`).
// Today only the IMDb ratings CSV ("Your Ratings" > Export), the one format
// the MovieLens import takes (movielens.org, Import or Export Data).
//
// Each film goes with its current Nota (the latest), doubled to IMDb's 1 to
// 10 scale. What the Catálogo lacks stays blank; a film outside it has only
// its tconst, the rating, the date and the URL.
//
// The result carries the file's text, not a path: the web app and the MCP
// hand it to whoever asked for it.

import type { SQLOutputValue } from 'node:sqlite'
import { Effect } from 'effect'
import { pyRepr } from '../compat/number.ts'
import { resolvePerson } from '../people/people.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import { Sqlite, type SqliteError } from '../sqlite/Sqlite.ts'
import { csvRow } from './csv.ts'

export const EXPORT_FORMATS = ['imdb'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

export interface ExportResult {
  /** The Pessoa's slug. */
  readonly person: string
  readonly format: ExportFormat
  /** How many Notas went into the file. */
  readonly ratings: number
  /** How many of them are of films outside the Catálogo. */
  readonly outsideCatalog: number
  /** The file, as UTF-8 text. */
  readonly content: string
}

export const IMDB_HEADER = [
  'Const',
  'Your Rating',
  'Date Rated',
  'Title',
  'Original Title',
  'URL',
  'Title Type',
  'IMDb Rating',
  'Runtime (mins)',
  'Year',
  'Genres',
  'Num Votes',
  'Release Date',
  'Directors',
] as const

const RATINGS = `
SELECT n.filme_id AS film, n.nota AS rating, n.data AS date, f.id AS in_catalog,
       f.titulo AS title, f.nota_imdb AS imdb_rating, f.duracao_min AS runtime,
       f.ano AS year, f.votos AS votes,
       (SELECT group_concat(genero, ', ') FROM
            (SELECT genero FROM generos_imdb WHERE filme_id = n.filme_id ORDER BY ordem)) AS genres,
       (SELECT group_concat(rotulo, ', ') FROM
            (SELECT e.rotulo FROM arestas a JOIN entidades e ON e.id = a.entidade_id
             WHERE a.filme_id = n.filme_id AND a.predicado = 'diretor' ORDER BY e.rotulo)) AS directors
FROM notas_vigentes n LEFT JOIN filmes f ON f.id = n.filme_id
WHERE n.pessoa = ?
ORDER BY n.data DESC, n.filme_id
`

/** From 0.5 to 5 stars to 1 to 10: a half star becomes an exact integer. */
export const imdbRating = (rating: number): number =>
  Math.trunc(rating * 2 + 0.5)

type Value = SQLOutputValue | undefined

/** Python's `str()` of an INTEGER column, blank for NULL. */
const integer = (value: Value): string =>
  typeof value === 'number' || typeof value === 'bigint'
    ? String(value)
    : text(value)

/** Python's `str()` of a REAL column ("8.0"), blank for NULL. */
const real = (value: Value): string =>
  typeof value === 'number' ? pyRepr(value) : text(value)

const text = (value: Value): string => (typeof value === 'string' ? value : '')

/** The Notas of the Pessoa named `person` (slug, name or alias), in
 * `format`. */
export const exportRatings = (
  person: string,
  format: ExportFormat,
): Effect.Effect<
  ExportResult,
  EngineError | SqliteError,
  Environment | Sqlite
> =>
  Effect.gen(function* () {
    const { slug } = yield* resolvePerson(person)
    const sqlite = yield* Sqlite
    const rows = yield* sqlite.read((db) => db.all(RATINGS, slug))
    let content = csvRow(IMDB_HEADER)
    let outsideCatalog = 0
    for (const row of rows) {
      const film = text(row['film'])
      const inCatalog = row['in_catalog'] !== null
      if (!inCatalog) outsideCatalog++
      content += csvRow([
        film,
        String(imdbRating(Number(row['rating']))),
        text(row['date']),
        text(row['title']),
        '',
        `https://www.imdb.com/title/${film}/`,
        inCatalog ? 'Movie' : '',
        real(row['imdb_rating']),
        integer(row['runtime']),
        integer(row['year']),
        text(row['genres']),
        inCatalog ? integer(row['votes']) : '',
        '',
        text(row['directors']),
      ])
    }
    return {
      person: slug,
      format,
      ratings: rows.length,
      outsideCatalog,
      content,
    }
  })
