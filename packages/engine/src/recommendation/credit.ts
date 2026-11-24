// Crédito [credit]: how far a Pessoa fell behind in the recent Sessions
// (`sessao/credito.py`, issue #8).
//
// For each past Session, the difference is the mean of the Presentes'
// reactions to the chosen film minus hers, all from 0 to 1. Only group
// Sessions with Feedback and a chosen film count, where she reacted and was
// with at least one of today's Presentes; of those, the `window` most
// recent. Crédito = max(0, mean of the differences). A Presente with no
// reaction is outside that Session's mean. Vetos cost no Crédito.

import { Effect } from 'effect'
import { compareTuple } from '../compat/compare.ts'
import { pythonError } from '../compat/python-error.ts'
import { pyRound, pySum } from '../compat/number.ts'
import { makeEvidence, type Evidence } from '../evidence/Evidence.ts'
import { feedbackStrength } from '../evidence/ruler.ts'
import { ratingText } from '../evidence/wording.ts'
import { sessionOrder } from '../sessions/order.ts'
import { num, numOrNull, text, textOrNull } from '../sqlite/row.ts'
import type { Connection, Row, SqliteError } from '../sqlite/Sqlite.ts'
import { kindOf } from '../sqlite/vocabulary.ts'

interface Origin {
  readonly difference: number
  readonly mean: number
  readonly session: Row
  readonly reaction: Row
}

export interface Credit {
  readonly value: number
  /** The Session where she fell furthest behind, for the credit line. */
  readonly origin: Origin | null
}

/** Each Presente's Crédito, in the Presentes' order. */
export const computeCredit = (
  db: Connection,
  attendees: ReadonlyArray<string>,
  window: number,
): Effect.Effect<ReadonlyMap<string, Credit>, SqliteError> =>
  Effect.gen(function* () {
    const sessions = [
      ...(yield* db.all(
        `SELECT s.id, s.data, s.escolhido, f.titulo, f.ano FROM sessoes s LEFT JOIN filmes f ON f.id = s.escolhido
         WHERE s.feedback_em IS NOT NULL AND s.escolhido IS NOT NULL ORDER BY s.id`,
      )),
    ]
      .map((row) => ({
        row,
        key: sessionOrder({ id: text(row, 'id'), date: text(row, 'data') }),
      }))
      // `sort(key=ordem, reverse=True)`: inverted, so ties keep their order.
      .sort((a, b) => compareTuple([...b.key], [...a.key]))
      .map(({ row }) => row)
    const attendeesOf = new Map<string, Set<string>>()
    for (const row of yield* db.all(
      'SELECT sessao, pessoa FROM sessao_presentes ORDER BY sessao, pessoa',
    )) {
      const session = text(row, 'sessao')
      attendeesOf.set(
        session,
        new Set([...(attendeesOf.get(session) ?? []), text(row, 'pessoa')]),
      )
    }
    const reactionsOf = new Map<string, Map<string, Row>>()
    for (const row of yield* db.all(
      'SELECT * FROM reacoes ORDER BY sessao, pessoa, fato_id',
    )) {
      const session = text(row, 'sessao')
      const reactions = reactionsOf.get(session) ?? new Map<string, Row>()
      reactions.set(text(row, 'pessoa'), row)
      reactionsOf.set(session, reactions)
    }

    const credits = new Map<string, Credit>()
    for (const person of attendees) {
      const othersToday = new Set(attendees.filter((p) => p !== person))
      const differences: Origin[] = []
      for (const session of sessions) {
        const id = text(session, 'id')
        const there = attendeesOf.get(id) ?? new Set<string>()
        const reactions = reactionsOf.get(id) ?? new Map<string, Row>()
        const own = reactions.get(person)
        if (
          own === undefined ||
          there.size < 2 ||
          ![...there].some((p) => p !== person && othersToday.has(p))
        )
          continue
        const mean =
          pySum([...reactions.values()].map((r) => num(r, 'valor'))) /
          reactions.size
        differences.push({
          difference: mean - num(own, 'valor'),
          mean,
          session,
          reaction: own,
        })
        if (differences.length === window) break
      }
      const value =
        differences.length > 0
          ? Math.max(
              0.0,
              pySum(differences.map((d) => d.difference)) / differences.length,
            )
          : 0.0
      // Among ties, Python's `max` keeps the first, the most recent.
      const origin =
        value > 0
          ? differences.reduce((best, d) =>
              d.difference > best.difference ? d : best,
            )
          : null
      credits.set(person, { value, origin })
    }
    return credits
  })

const REPORTED: Readonly<Record<string, string>> = {
  gostou: 'gostou',
  neutro: 'achou neutro',
  'não gostou': 'não gostou',
}

/** The line of the film that went up because of the Crédito, citing the
 * Session where the Pessoa fell furthest behind. It adds nothing to the
 * utility (base 0): the Crédito acts on the Regra, not on the Evidence. */
export const creditLine = (
  person: string,
  name: string,
  credit: Credit,
  filmId: string,
  today: string,
): Evidence => {
  if (credit.origin === null)
    throw new TypeError("'NoneType' object is not subscriptable")
  const { session, reaction, mean } = credit.origin
  const film = textOrNull(session, 'titulo') || text(session, 'escolhido')
  const kind = kindOf(text(reaction, 'tipo')) as 'rating' | 'report'
  const rating = numOrNull(reaction, 'nota')
  const reported = REPORTED[String(reaction['reacao'])]
  if (kind === 'report' && reported === undefined)
    throw pythonError('KeyError', `'${String(reaction['reacao'])}'`)
  const reacted =
    kind === 'rating' ? `deu ${ratingText(rating ?? Number.NaN)}` : reported
  const average = ratingText(pyRound(0.5 + 4.5 * mean, 1))
  return makeEvidence({
    person,
    filmId,
    text: `na Sessão de ${text(session, 'data')} (${film}), ${name} ${reacted} e a média dos Presentes foi ${average}`,
    source: text(reaction, 'fonte'),
    date: text(reaction, 'data'),
    strength: feedbackStrength(
      kind,
      rating ?? 0,
      text(reaction, 'data'),
      today,
    ),
    kind,
    factId: text(reaction, 'fato_id'),
    base: 0.0,
  })
}
