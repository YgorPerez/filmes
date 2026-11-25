// `60_faixas_etarias`: each age rating of the catalog converted to the scale
// L, 6, 10, 12, 14, 16, 18 (`catalog/age-rating.ts`); a label the table
// does not take leaves no row.

import { Effect } from 'effect'
import { CLASSIND, convertRating, ratingAge } from '../../catalog/age-rating.ts'
import { text } from '../../sqlite/row.ts'
import type { Step } from './Step.ts'

export const ageRatings: Step = {
  name: '60_faixas_etarias',
  load: (db) =>
    Effect.gen(function* () {
      const rows = yield* db.all(
        'SELECT fato_id, filme_id, propriedade, rotulo, fonte, data FROM classificacoes ORDER BY fato_id',
      )
      for (const row of rows) {
        const property = text(row, 'propriedade')
        const label = text(row, 'rotulo')
        const converted = convertRating(property, label)
        if (converted === undefined) continue
        const [system, rating] = converted
        yield* db.run(
          `INSERT INTO faixas_etarias (fato_id, filme_id, faixa, idade, sistema, propriedade, rotulo,
                                           convertida, fonte, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          text(row, 'fato_id'),
          text(row, 'filme_id'),
          rating,
          ratingAge(rating),
          system,
          property,
          label,
          property === CLASSIND ? 0 : 1,
          text(row, 'fonte'),
          text(row, 'data'),
        )
      }
    }),
}
