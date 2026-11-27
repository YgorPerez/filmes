// The CSV Letterboxd's importer reads (letterboxd.com/about/importing-data,
// #286), so what a Pessoa rated and saw in filmes reaches her diary.
//
// One row per film she has a Nota or a Já visto of:
// - imdbID, by which Letterboxd finds the film; Title and Year from the
//   Catálogo, blank outside it.
// - Rating10: her current Nota (from an import, the Feedback, the Cartaz or
//   the conversation), doubled to 1 to 10; blank with only a Já visto.
// - WatchedDate: the last day she watched it, or the day of the Nota when
//   filmes has no Já visto of it. Letterboxd makes it a diary entry, and a
//   row with the date of an entry she has updates that entry, so exporting
//   again adds none.
// - Review: what she last said of the film (the Feedback's comment, the
//   Cartaz's "achou"), but not what came from her Letterboxd itself, which
//   is there already.
//
// Newest first, as the IMDb CSV.

import { Effect } from 'effect'
import { Sqlite } from '../sqlite/Sqlite.ts'
import { letterboxdRow } from './csv.ts'
import { integer, tenScale, text, type FileWriter } from './file.ts'

export const LETTERBOXD_HEADER = [
  'imdbID',
  'Title',
  'Year',
  'Rating10',
  'WatchedDate',
  'Review',
] as const

const FILMS = `
WITH films AS (
    SELECT filme_id FROM notas_vigentes WHERE pessoa = ?1
    UNION SELECT filme_id FROM ja_visto WHERE pessoa = ?1
), dated AS (
    SELECT f.filme_id AS film, c.id AS in_catalog, c.titulo AS title, c.ano AS year,
           n.nota AS rating,
           coalesce((SELECT max(substr(j.data, 1, 10)) FROM ja_visto j
                     WHERE j.pessoa = ?1 AND j.filme_id = f.filme_id),
                    substr(n.data, 1, 10)) AS watched,
           (SELECT d.texto FROM declarados d
            WHERE d.pessoa = ?1 AND d.alvo = f.filme_id AND d.especifico = 1
              AND d.fato_id NOT LIKE 'letterboxd:%'
            ORDER BY d.data DESC, d.fato_id DESC LIMIT 1) AS review
    FROM films f
    LEFT JOIN filmes c ON c.id = f.filme_id
    LEFT JOIN notas_vigentes n ON n.pessoa = ?1 AND n.filme_id = f.filme_id
)
SELECT * FROM dated ORDER BY watched DESC, film
`

/** The Notas and Já vistos of the Pessoa with this slug. */
export const letterboxdFile: FileWriter = (slug) =>
  Effect.gen(function* () {
    const sqlite = yield* Sqlite
    const rows = yield* sqlite.read((db) => db.all(FILMS, slug))
    let content = letterboxdRow(LETTERBOXD_HEADER)
    let ratings = 0
    let outsideCatalog = 0
    for (const row of rows) {
      const rated = row['rating'] !== null
      if (rated) ratings++
      if (row['in_catalog'] === null) outsideCatalog++
      content += letterboxdRow([
        text(row['film']),
        text(row['title']),
        integer(row['year']),
        rated ? String(tenScale(Number(row['rating']))) : '',
        text(row['watched']),
        text(row['review']),
      ])
    }
    return { ratings, outsideCatalog, content }
  })
