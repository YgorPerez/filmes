// The Escala da Pessoa [rating scale] the ruler reads her Notas on (#172):
// her own Notas (Tipo nota, the current one of each film), or the MovieLens
// population's below `[rating_percentile] min_ratings`.

import { Effect } from 'effect'
import { ratingScale, type RatingScale } from '../evidence/ruler.ts'
import type { Weights } from '../runtime/Weights.ts'
import type { Connection, Row, SqliteError } from '../sqlite/Sqlite.ts'
import { num } from '../sqlite/row.ts'

const OWN = `
SELECT nota, count(*) AS quantidade FROM notas_vigentes
WHERE pessoa = ? AND tipo = 'nota' GROUP BY nota
`

const counts = (rows: ReadonlyArray<Row>): Map<number, number> =>
  new Map(rows.map((row) => [num(row, 'nota'), num(row, 'quantidade')]))

/** The scale of `person` in `db`, with the cuts of `weights`. */
export const readRatingScale = (
  db: Connection,
  person: string,
  weights: Pick<Weights, 'rating_percentile'>,
): Effect.Effect<RatingScale, SqliteError> =>
  Effect.gen(function* () {
    const own = counts(yield* db.all(OWN, person))
    const population = counts(
      yield* db.all('SELECT nota, quantidade FROM notas_movielens'),
    )
    return ratingScale(own, population, weights.rating_percentile)
  })
