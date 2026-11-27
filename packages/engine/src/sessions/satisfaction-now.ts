// The satisfaction as it stands today for a group of Presentes: what the
// next Recomendação of that group would weigh (the default Regra), with the
// line of each one who is behind the most satisfied. The Feedback screen
// shows it, so the Dono sees what a Feedback just changed.

import { Effect } from 'effect'
import { pyRound } from '../compat/number.ts'
import { readPeople } from '../people/people.ts'
import { readRatingScale } from '../people/rating-scale.ts'
import {
  groupSatisfaction,
  satisfactionLine,
} from '../recommendation/group-satisfaction.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import { Environment } from '../runtime/Environment.ts'
import { ownerOf } from '../runtime/Owner.ts'
import { Run } from '../runtime/Run.ts'
import { Sqlite, type SqliteError } from '../sqlite/Sqlite.ts'

export interface PersonSatisfactionNow {
  readonly person: string
  /** Rounded to 4 places, as the Recomendação's `satisfaction`; null with
   * no reaction in her recent shared Sessions. */
  readonly satisfaction: number | null
  /** "<nome>: 11% nas últimas Sessões (deu 2 de 10 a <filme>); Iara,
   * 100%", with "Você" for the Dono who looks (#346); null when she is
   * behind nobody. */
  readonly line: string | null
}

export interface SatisfactionNow {
  /** In the Presentes' order. */
  readonly people: ReadonlyArray<PersonSatisfactionNow>
  /** Rounded to 4 places; null with fewer than two satisfactions. */
  readonly disagreement: number | null
}

/** The satisfaction of each Presente now (slugs). Alone, nobody is behind
 * anybody, as in the Recomendação. */
export const satisfactionNow = (
  attendees: ReadonlyArray<string>,
): Effect.Effect<
  SatisfactionNow,
  EngineError | SqliteError,
  Environment | Sqlite | Run
> =>
  Effect.gen(function* () {
    if (attendees.length < 2)
      return {
        people: attendees.map((person) => ({
          person,
          satisfaction: null,
          line: null,
        })),
        disagreement: null,
      }
    const { weights } = yield* Environment
    const { today } = yield* Run
    const names = new Map(
      (yield* readPeople).map((p) => [p.slug, p.name] as const),
    )
    const sqlite = yield* Sqlite
    const [group, scales, owner] = yield* sqlite.read((db) =>
      Effect.all([
        groupSatisfaction(db, attendees, weights.satisfaction.window),
        Effect.forEach(attendees, (p) => readRatingScale(db, p, weights)),
        ownerOf(db),
      ]),
    )
    const nameOf = (slug: string) =>
      slug === owner ? 'Você' : (names.get(slug) ?? slug)
    return {
      people: attendees.map((person, i) => {
        const own = group.people.get(person)
        const scale = scales[i]
        return {
          person,
          satisfaction: own === undefined ? null : pyRound(own.satisfaction, 4),
          line:
            group.behind.has(person) && scale
              ? satisfactionLine(person, nameOf, group, scale, '', today, owner)
                  .text
              : null,
        }
      }),
      disagreement:
        group.disagreement === null ? null : pyRound(group.disagreement, 4),
    }
  })
