import { Effect, Schema } from 'effect'
import { factId } from '../../compat/fact-id.ts'
import { makeEvidence, type Evidence } from '../../evidence/Evidence.ts'
import { awardStrength } from '../../evidence/ruler.ts'
import { Environment } from '../../runtime/Environment.ts'
import type { Signal } from './Signal.ts'

const AwardsToml = Schema.Record(
  Schema.String,
  Schema.Struct({ win: Schema.String, nomination: Schema.String }),
)

export const AWARDS_TABLE = 'awards'

export const awards: Signal = {
  module: 'premios',
  forFilm: (round) =>
    Effect.gen(function* () {
      const weights = round.weights.awards
      if (weights === undefined || round.candidates.size === 0) return []

      const labels = yield* (yield* Environment).readConfig(
        'awards',
        AwardsToml,
      )
      const rows = yield* round.db.all(
        `SELECT filme_id, entidade_id, predicado, fato_id, fonte, data
           FROM arestas
          WHERE entidade_id IN (SELECT value FROM json_each(?))
            AND predicado IN ('premio', 'indicacao')
          ORDER BY filme_id, predicado DESC, entidade_id, data DESC, fato_id`,
        JSON.stringify(Object.keys(labels)),
      )

      const byFilm = new Map<string, Set<string>>()
      const lines: Evidence[] = []
      for (const row of rows) {
        const filmId = String(row['filme_id'])
        if (!round.candidates.has(filmId)) continue
        const awardId = String(row['entidade_id'])
        const label = labels[awardId]
        if (label === undefined) continue

        // A win comes before a nomination for the same award. The first
        // line carries the whole bonus, regardless of how many awards match.
        const seen = byFilm.get(filmId) ?? new Set<string>()
        if (seen.has(awardId)) continue
        lines.push(
          makeEvidence({
            person: null,
            filmId,
            text: row['predicado'] === 'premio' ? label.win : label.nomination,
            source: String(row['fonte']),
            date: String(row['data']),
            strength: awardStrength(),
            kind: 'metadata',
            factId: factId(AWARDS_TABLE, String(row['fato_id'])),
            base: seen.size === 0 ? weights.weight : 0,
            countsAsFact: false,
          }),
        )
        seen.add(awardId)
        byFilm.set(filmId, seen)
      }
      return lines
    }),
}
