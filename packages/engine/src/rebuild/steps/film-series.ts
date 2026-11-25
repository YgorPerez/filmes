// `21_series_de_filmes`: drops the series edges that point at lists, not at
// film series, when the catalog says which items are film series.

import { Effect } from 'effect'
import type { Step } from './Step.ts'

export const filmSeries: Step = {
  name: '21_series_de_filmes',
  load: (db) =>
    Effect.gen(function* () {
      if (
        (yield* db.get('SELECT 1 FROM series_de_filmes LIMIT 1')) === undefined
      )
        return
      yield* db.run(`
        DELETE FROM arestas
        WHERE predicado = 'serie' AND entidade_id NOT IN (SELECT item FROM series_de_filmes)
    `)
    }),
}
