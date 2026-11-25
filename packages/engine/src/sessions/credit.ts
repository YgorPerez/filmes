// The Crédito as it stands today for a group of Presentes: what the next
// Recomendação of that group would use (the default Regra), with the line
// of the Session where each one fell furthest behind. The Feedback screen
// shows it, so the Dono sees what a Feedback just changed.

import { Effect } from 'effect'
import { pyRound } from '../compat/number.ts'
import { readPeople } from '../people/people.ts'
import { computeCredit, creditLine } from '../recommendation/credit.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import { Environment } from '../runtime/Environment.ts'
import { Run } from '../runtime/Run.ts'
import { Sqlite, type SqliteError } from '../sqlite/Sqlite.ts'

export interface CreditNow {
  readonly person: string
  /** Rounded to 4 places, as the Recomendação's `credit`. */
  readonly value: number
  /** "na Sessão de <data> (<filme>), <nome> deu 1 e a média dos Presentes
   * foi 3"; null with no Crédito. */
  readonly line: string | null
}

/** Each Presente's Crédito now, in the Presentes' order (slugs). Alone,
 * nobody has Crédito, as in the Recomendação. */
export const creditNow = (
  attendees: ReadonlyArray<string>,
): Effect.Effect<
  ReadonlyArray<CreditNow>,
  EngineError | SqliteError,
  Environment | Sqlite | Run
> =>
  Effect.gen(function* () {
    if (attendees.length < 2)
      return attendees.map((person) => ({ person, value: 0, line: null }))
    const { weights } = yield* Environment
    const { today } = yield* Run
    const names = new Map(
      (yield* readPeople).map((p) => [p.slug, p.name] as const),
    )
    const sqlite = yield* Sqlite
    const credits = yield* sqlite.read((db) =>
      computeCredit(db, attendees, weights.credit.window),
    )
    return attendees.map((person) => {
      const credit = credits.get(person)
      if (credit === undefined || credit.origin === null)
        return { person, value: 0, line: null }
      return {
        person,
        value: pyRound(credit.value, 4),
        line: creditLine(person, names.get(person) ?? person, credit, '', today)
          .text,
      }
    })
  })
