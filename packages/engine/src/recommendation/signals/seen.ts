// Já visto [seen]: the Pessoa already watched the Candidate. Weighs against,
// always strong (`recomendacao/sinais/ja_visto.py`).
//
// Reads the `ja_vistos` view, the same as the "sem Já visto" Restrição:
// every Nota of the Pessoa and the `ja_visto` rows (Feedback, watched
// imports and history). One Evidence per film: the latest record.

import { Effect } from 'effect'
import { makeEvidence } from '../../evidence/Evidence.ts'
import { SEEN_STRENGTH } from '../../evidence/ruler.ts'
import { text } from '../../sqlite/row.ts'
import { kindOf } from '../../sqlite/vocabulary.ts'
import type { PluralWording } from '../../evidence/wording.ts'
import type { Signal } from './Signal.ts'

/** A Já visto's line, and its plural. */
export const SEEN_PLURAL: PluralWording = {
  one: 'já viu',
  many: 'já viram',
  start: true,
}

const LATEST = `
SELECT filme_id, fato_id, tipo, data, fonte FROM (
    SELECT *, row_number() OVER (PARTITION BY filme_id ORDER BY data DESC, fato_id) AS ordem
    FROM ja_vistos WHERE pessoa = ?
) WHERE ordem = 1 ORDER BY filme_id
`

export const seen: Signal = {
  module: 'ja_visto',
  forPerson: (round, person) =>
    Effect.map(round.db.all(LATEST, person), (rows) =>
      rows
        .filter((row) => round.candidates.has(text(row, 'filme_id')))
        .map((row) =>
          makeEvidence({
            person,
            filmId: text(row, 'filme_id'),
            text: SEEN_PLURAL.one,
            source: text(row, 'fonte'),
            date: text(row, 'data'),
            strength: SEEN_STRENGTH,
            kind: kindOf(text(row, 'tipo')),
            factId: text(row, 'fato_id'),
            base: -round.weights.seen.weight,
            seen: true,
          }),
        ),
    ),
}
