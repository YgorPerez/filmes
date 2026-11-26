// `71_escalas_de_gosto`: the percentile of each rating of each MovieLens
// user of the taste neighbours' sample on that user's own scale (schema in
// `52_vizinhos_de_gosto.sql`), the same mid-rank as a Pessoa's
// `ratingPercentile`: the share of the user's ratings below it plus half
// of the equal ones.

import { Effect } from 'effect'
import type { Step } from './Step.ts'

export const TASTE_SCALES_SQL = `
  INSERT INTO percentis_gosto_movielens (usuario, nota, percentil)
  SELECT usuario, nota,
         (coalesce(sum(quantidade) OVER abaixo, 0) + quantidade / 2.0)
           / sum(quantidade) OVER todas
  FROM (SELECT usuario, nota, count(*) AS quantidade
        FROM notas_gosto_movielens GROUP BY usuario, nota)
  WINDOW todas AS (PARTITION BY usuario),
         abaixo AS (PARTITION BY usuario ORDER BY nota
                    ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)`

export const tasteScales: Step = {
  name: '71_escalas_de_gosto',
  load: (db) => Effect.asVoid(db.run(TASTE_SCALES_SQL)),
}
