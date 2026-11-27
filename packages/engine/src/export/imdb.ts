// The IMDb ratings CSV ("Your Ratings" > Export), the one format the
// MovieLens import takes (movielens.org, Import or Export Data).
//
// Each film goes with its current Nota (the latest), doubled to IMDb's 1 to
// 10 scale. What the Catálogo lacks stays blank; a film outside it has only
// its tconst, the rating, the date and the URL.

import { Effect } from 'effect'
import { Sqlite } from '../sqlite/Sqlite.ts'
import { csvRow } from './csv.ts'
import { integer, real, tenScale, text, type FileWriter } from './file.ts'

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

/** The current Notas of the Pessoa with this slug. */
export const imdbFile: FileWriter = (slug) =>
  Effect.gen(function* () {
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
        String(tenScale(Number(row['rating']))),
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
    return { ratings: rows.length, outsideCatalog, content }
  })
