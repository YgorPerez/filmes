// The watchlist [watchlist]: a film the Presente put on her Letterboxd,
// Trakt or Simkl (#299) watchlist is a Declarado in her favour, moderate
// (#280); her TV Time list too (#300).
//
// One Evidence per film, the latest entry; the base is `[people]
// statement_weight`, like a Declarado about an entity. A Já visto of the
// film wins (the `ja_vistos` view, the same as the Já visto signal): a film
// she has seen is no longer one she wants to see.

import { Effect } from 'effect'
import { makeEvidence } from '../../evidence/Evidence.ts'
import { watchlistStrength } from '../../evidence/ruler.ts'
import type { PluralWording } from '../../evidence/wording.ts'
import { text } from '../../sqlite/row.ts'
import { candidatesJson, type Signal } from './Signal.ts'

/** Each import's line, by the start of its `fato_id`. */
const LINE: Readonly<Record<string, PluralWording>> = Object.fromEntries(
  ['Letterboxd', 'Trakt', 'Simkl', 'TV Time'].map((name) => [
    name.toLowerCase().replace(' ', ''),
    {
      one: `está na lista do ${name}`,
      many: `estão na lista do ${name}`,
      start: true,
    },
  ]),
)

/** The plurals of the watchlist's lines. */
export const WATCHLIST_PLURALS: ReadonlyArray<PluralWording> =
  Object.values(LINE)

const LATEST = `
SELECT filme_id, fato_id, data, fonte FROM (
    SELECT *, row_number() OVER (PARTITION BY filme_id ORDER BY data DESC, fato_id) AS ordem
    FROM watchlist w
    WHERE w.pessoa = ?
      AND w.filme_id IN (SELECT value FROM json_each(?))
      AND NOT EXISTS (
          SELECT 1 FROM ja_vistos j WHERE j.pessoa = w.pessoa AND j.filme_id = w.filme_id)
) WHERE ordem = 1 ORDER BY filme_id
`

export const watchlist: Signal = {
  module: 'watchlist',
  forPerson: (round, person) =>
    Effect.map(round.db.all(LATEST, person, candidatesJson(round)), (rows) =>
      rows.flatMap((row) => {
        const factId = text(row, 'fato_id')
        const line = LINE[factId.slice(0, factId.indexOf(':'))]
        if (line === undefined) return []
        return [
          makeEvidence({
            person,
            filmId: text(row, 'filme_id'),
            text: line.one,
            source: text(row, 'fonte'),
            date: text(row, 'data'),
            strength: watchlistStrength(),
            kind: 'stated',
            factId,
            base: round.weights.people.statement_weight,
          }),
        ]
      }),
    ),
}
