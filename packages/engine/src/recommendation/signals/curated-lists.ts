// The curated lists (#411): a film in the Criterion Collection (edge
// `colecao`, from Wikidata) or in the main competition of a festival (edge
// `competicao`, from the English Wikipedia) gets one line per list of
// `config/curated_lists.toml`, as the awards (#281). Not a Fato.

import { Effect, Schema } from 'effect'
import { factId } from '../../compat/fact-id.ts'
import { makeEvidence, type Evidence } from '../../evidence/Evidence.ts'
import { curatedListStrength } from '../../evidence/ruler.ts'
import { Environment } from '../../runtime/Environment.ts'
import type { Signal } from './Signal.ts'

const CuratedListsToml = Schema.Record(
  Schema.String,
  Schema.Struct({
    label: Schema.String,
    top_prize: Schema.optionalKey(Schema.String),
  }),
)

export const CURATED_LISTS_TABLE = 'curated_lists'

export const curatedLists: Signal = {
  module: 'listas_curadas',
  forFilm: (round) =>
    Effect.gen(function* () {
      const weights = round.weights.curated_lists
      if (round.candidates.size === 0) return []

      const lists = yield* (yield* Environment).readConfig(
        'curated_lists',
        CuratedListsToml,
      )
      const candidates = JSON.stringify([...round.candidates.keys()])
      // A film with the festival's top prize, won or nominated, already
      // says it competed there: winning implies competing.
      const prizes = new Set(
        (yield* round.db.all(
          `SELECT filme_id, entidade_id FROM arestas
            WHERE predicado IN ('premio', 'indicacao')
              AND filme_id IN (SELECT value FROM json_each(?))`,
          candidates,
        )).map((row) => `${String(row['filme_id'])} ${String(row['entidade_id'])}`),
      )
      const rows = yield* round.db.all(
        `SELECT filme_id, entidade_id, fato_id, fonte, data
           FROM arestas
          WHERE predicado IN ('colecao', 'competicao')
            AND entidade_id IN (SELECT value FROM json_each(?))
            AND filme_id IN (SELECT value FROM json_each(?))
          ORDER BY filme_id, predicado, entidade_id, data DESC, fato_id`,
        JSON.stringify(Object.keys(lists)),
        candidates,
      )

      const byFilm = new Map<string, Set<string>>()
      const lines: Evidence[] = []
      for (const row of rows) {
        const filmId = String(row['filme_id'])
        const listId = String(row['entidade_id'])
        const list = lists[listId]
        if (list === undefined) continue
        const seen = byFilm.get(filmId) ?? new Set<string>()
        if (seen.has(listId)) continue
        if (
          list.top_prize !== undefined &&
          prizes.has(`${filmId} ${list.top_prize}`)
        )
          continue
        // The first line carries the whole bonus, however many lists match.
        lines.push(
          makeEvidence({
            person: null,
            filmId,
            text: list.label,
            source: String(row['fonte']),
            date: String(row['data']),
            strength: curatedListStrength(),
            kind: 'metadata',
            factId: factId(CURATED_LISTS_TABLE, String(row['fato_id'])),
            base: seen.size === 0 ? weights.weight : 0,
            countsAsFact: false,
          }),
        )
        seen.add(listId)
        byFilm.set(filmId, seen)
      }
      return lines
    }),
}
