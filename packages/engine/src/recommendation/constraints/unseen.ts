// Sem Já visto [unseen]: only when the Dono asks, the film some Presente
// has seen is out (`restricoes/sem_ja_visto.py`). Without the request a
// Já visto removes no film; it only weighs against (#20).

import { Effect } from 'effect'
import { text } from '../../sqlite/row.ts'
import { pass, type Constraint, type ConstraintModule } from '../constraints.ts'

export interface UnseenRequest {
  /** `--sem-ja-visto`. */
  readonly unseen?: boolean
}

const unseen: Constraint = {
  name: 'unseen',
  toJson: () => ({}),
  stored: () => ({ name: 'unseen' }),
  result: () => ({}),
  evaluate: (context, films) =>
    Effect.gen(function* () {
      const rows = yield* context.db.all(
        `SELECT filme_id FROM ja_vistos WHERE pessoa IN (${context.attendees.map(() => '?').join(', ')}) ORDER BY filme_id`,
        ...context.attendees,
      )
      const seen = new Set(rows.map((row) => text(row, 'filme_id')))
      return new Map(
        [...films.keys()]
          .filter((id) => !seen.has(id))
          .map((id) => [id, pass()]),
      )
    }),
}

export const unseenModule: ConstraintModule<UnseenRequest> = {
  name: 'unseen',
  read: (request) => Effect.succeed(request.unseen ? unseen : undefined),
  label: () => 'nada repetido',
}
