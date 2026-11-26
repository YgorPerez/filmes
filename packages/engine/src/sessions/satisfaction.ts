// Satisfação [satisfaction] and Discordância [disagreement] (#171), from the
// reactions of a set of Sessions, after Stratigi et al. (see #170). A
// reaction goes from 0 to 1. `evaluate` measures the online window with it;
// the default Regra, each Presente's recent shared Sessions (#176).
//
// - Each Presente's satisfaction: the mean of her reactions in the set.
// - In each group Session (two or more Presentes reacted): the lowest
//   reaction, and the disagreement, highest minus lowest. `minimum` and
//   `disagreement` are their means over those Sessions.

import { Effect } from 'effect'
import { num, text } from '../sqlite/row.ts'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'

export interface PersonSatisfaction {
  /** Sessions in the window where she reacted. */
  readonly sessions: number
  readonly satisfaction: number
}

export interface Satisfaction {
  /** By Pessoa, in slug order. */
  readonly people: Readonly<Record<string, PersonSatisfaction>>
  readonly groupSessions: number
  readonly minimum: number | null
  readonly disagreement: number | null
}

const mean = (values: ReadonlyArray<number>): number | null =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null

export const satisfaction = (
  db: Connection,
  sessions: ReadonlyArray<string>,
): Effect.Effect<Satisfaction, SqliteError> =>
  Effect.gen(function* () {
    const bySession = new Map<string, number[]>()
    const byPerson = new Map<string, number[]>()
    for (const row of yield* db.all(
      `SELECT sessao, pessoa, valor FROM reacoes
       WHERE sessao IN (SELECT value FROM json_each(?))
       ORDER BY pessoa, sessao, fato_id`,
      JSON.stringify(sessions),
    )) {
      const value = num(row, 'valor')
      const session = text(row, 'sessao')
      const person = text(row, 'pessoa')
      bySession.set(session, [...(bySession.get(session) ?? []), value])
      byPerson.set(person, [...(byPerson.get(person) ?? []), value])
    }
    const groups = [...bySession.values()].filter((v) => v.length > 1)
    return {
      people: Object.fromEntries(
        [...byPerson].map(([person, values]) => [
          person,
          { sessions: values.length, satisfaction: mean(values)! },
        ]),
      ),
      groupSessions: groups.length,
      minimum: mean(groups.map((v) => Math.min(...v))),
      disagreement: mean(groups.map((v) => Math.max(...v) - Math.min(...v))),
    }
  })
