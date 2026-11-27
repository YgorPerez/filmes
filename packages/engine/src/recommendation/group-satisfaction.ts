// Satisfação [satisfaction] in the default Regra (#176, map #169), which
// replaced the Crédito. After Stratigi et al. (see #170): each Presente's
// satisfaction accumulated over the recent Sessions she shared with someone
// here today, measured as `evaluate` measures it (`sessions/satisfaction.ts`).
// Whoever is below the most satisfied of today weighs more, by the
// difference; the most satisfied loses nothing. The highest minus the lowest
// is the group's Discordância [disagreement].
//
// Her window: the `window` most recent Sessions with Feedback and a chosen
// film, with two or more Presentes, where she reacted and at least one of
// today's other Presentes was there. A Presente with no reaction there has no
// satisfaction and is behind nobody. Vetos cost nothing.

import { Effect } from 'effect'
import { compareTuple } from '../compat/compare.ts'
import { pythonError } from '../compat/python-error.ts'
import { makeEvidence, type Evidence } from '../evidence/Evidence.ts'
import { feedbackStrength, type RatingScale } from '../evidence/ruler.ts'
import { listText, tenScaleText } from '../evidence/wording.ts'
import { sessionOrder } from '../sessions/order.ts'
import { satisfaction } from '../sessions/satisfaction.ts'
import { num, numOrNull, text, textOrNull } from '../sqlite/row.ts'
import type { Connection, Row, SqliteError } from '../sqlite/Sqlite.ts'
import { kindOf } from '../sqlite/vocabulary.ts'

export interface PersonSatisfaction {
  readonly satisfaction: number
  /** Her lowest reaction in the window (the most recent of a tie), and its
   * Session: the Fato the satisfaction line cites. */
  readonly lowest: { readonly session: Row; readonly reaction: Row }
}

export interface GroupSatisfaction {
  /** The Presentes with a satisfaction, in the Presentes' order. */
  readonly people: ReadonlyMap<string, PersonSatisfaction>
  /** The highest satisfaction; null with fewer than two. */
  readonly highest: number | null
  /** The highest minus the lowest; null with fewer than two. */
  readonly disagreement: number | null
  /** How far each one below the highest is from it. */
  readonly behind: ReadonlyMap<string, number>
}

/** The Sessions with Feedback and a chosen film, the most recent first,
 * with who was there and each one's reaction. */
interface History {
  readonly sessions: ReadonlyArray<Row>
  /** Session → its Presentes. */
  readonly attendeesOf: ReadonlyMap<string, ReadonlySet<string>>
  /** Session → Pessoa → her reaction. */
  readonly reactionsOf: ReadonlyMap<string, ReadonlyMap<string, Row>>
}

const readHistory = (db: Connection): Effect.Effect<History, SqliteError> =>
  Effect.gen(function* () {
    const sessions = [
      ...(yield* db.all(
        `SELECT s.id, s.data, s.escolhido, f.titulo FROM sessoes s LEFT JOIN filmes f ON f.id = s.escolhido
         WHERE s.feedback_em IS NOT NULL AND s.escolhido IS NOT NULL ORDER BY s.id`,
      )),
    ]
      .map((row) => ({
        row,
        key: sessionOrder({ id: text(row, 'id'), date: text(row, 'data') }),
      }))
      // The most recent first; ties keep their order.
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
    return { sessions, attendeesOf, reactionsOf }
  })

/** The Pessoa's window: her most recent reactions in Sessions she shared
 * with another of today's Presentes. */
const windowOf = (
  history: History,
  person: string,
  attendees: ReadonlyArray<string>,
  window: number,
): Array<PersonSatisfaction['lowest']> => {
  const othersToday = new Set(attendees.filter((p) => p !== person))
  const shared: Array<PersonSatisfaction['lowest']> = []
  for (const session of history.sessions) {
    const id = text(session, 'id')
    const there = history.attendeesOf.get(id) ?? new Set<string>()
    const reaction = history.reactionsOf.get(id)?.get(person)
    if (
      reaction === undefined ||
      there.size < 2 ||
      ![...there].some((p) => p !== person && othersToday.has(p))
    )
      continue
    shared.push({ session, reaction })
    if (shared.length === window) break
  }
  return shared
}

/** The satisfaction of today's Presentes (slugs, in the request's order). */
export const groupSatisfaction = (
  db: Connection,
  attendees: ReadonlyArray<string>,
  window: number,
): Effect.Effect<GroupSatisfaction, SqliteError> =>
  Effect.gen(function* () {
    const history = yield* readHistory(db)
    const people = new Map<string, PersonSatisfaction>()
    for (const person of attendees) {
      const shared = windowOf(history, person, attendees, window)
      if (shared.length === 0) continue
      const measured = yield* satisfaction(
        db,
        shared.map(({ session }) => text(session, 'id')),
      )
      const own = measured.people[person]
      if (own === undefined) throw pythonError('KeyError', `'${person}'`)
      people.set(person, {
        satisfaction: own.satisfaction,
        lowest: shared.reduce((low, s) =>
          num(s.reaction, 'valor') < num(low.reaction, 'valor') ? s : low,
        ),
      })
    }
    const values = [...people.values()].map((p) => p.satisfaction)
    const highest = values.length > 1 ? Math.max(...values) : null
    return {
      people,
      highest,
      disagreement: highest === null ? null : highest - Math.min(...values),
      behind: new Map(
        highest === null
          ? []
          : [...people]
              .filter(([, p]) => p.satisfaction < highest)
              .map(([person, p]) => [person, highest - p.satisfaction]),
      ),
    }
  })

/** How a Relato cites the film: "gostou de F", "achou F neutro". */
const REPORTED: Readonly<Record<string, (film: string) => string>> = {
  gostou: (film) => `gostou de ${film}`,
  neutro: (film) => `achou ${film} neutro`,
  'não gostou': (film) => `não gostou de ${film}`,
}

const percent = (value: number): string => `${Math.round(value * 100)}%`

/** Who has the highest satisfaction, in the Presentes' order: "Iara",
 * "Iara e Rosa", "você" (the `viewer`); null when nobody holds it. */
const highestNames = (
  group: GroupSatisfaction,
  nameOf: (person: string) => string,
  viewer: string | null,
): string | null => {
  const names = [...group.people]
    .filter(([, p]) => p.satisfaction === group.highest)
    .map(([person]) => (person === viewer ? 'você' : nameOf(person)))
  return names.length === 0 ? null : listText(names)
}

/** The line of who is behind the most satisfied, citing her lowest
 * reaction in the window and naming the highest: "Teo: 22% nas últimas
 * Sessões (deu 3 de 10 a Quermesse); Iara, 100%" (#346). It opens with her
 * name: it is a line of the film, with no name before it on the Cartaz.
 * `nameOf` says each Pessoa's name ("Você" for the `viewer`, the Dono who
 * looks on Contar, who is "você" after the semicolon). With nobody at the
 * highest, the line ends at the reaction.
 * It adds nothing to the utility (base 0): the satisfaction acts on the
 * Regra, not on the Evidence. A cited Nota is read on her scale (#172), and
 * written on 1–10 (#272). */
export const satisfactionLine = (
  person: string,
  nameOf: (person: string) => string,
  group: GroupSatisfaction,
  scale: RatingScale,
  filmId: string,
  today: string,
  viewer: string | null = null,
): Evidence => {
  const own = group.people.get(person)
  if (own === undefined || group.highest === null)
    throw pythonError('KeyError', `'${person}'`)
  const { session, reaction } = own.lowest
  const film = textOrNull(session, 'titulo') || text(session, 'escolhido')
  const kind = kindOf(text(reaction, 'tipo')) as 'rating' | 'report'
  const rating = numOrNull(reaction, 'nota')
  const reported = REPORTED[String(reaction['reacao'])]
  if (kind === 'report' && reported === undefined)
    throw pythonError('KeyError', `'${String(reaction['reacao'])}'`)
  const reacted =
    kind === 'rating'
      ? `deu ${tenScaleText(rating ?? Number.NaN)} a ${film}`
      : (reported?.(film) ?? '')
  const highest = highestNames(group, nameOf, viewer)
  return makeEvidence({
    person,
    filmId,
    text:
      `${nameOf(person)}: ${percent(own.satisfaction)} nas últimas Sessões (${reacted})` +
      (highest === null ? '' : `; ${highest}, ${percent(group.highest)}`),
    source: text(reaction, 'fonte'),
    date: text(reaction, 'data'),
    strength: feedbackStrength(
      kind,
      scale,
      rating ?? 0,
      text(reaction, 'data'),
      today,
    ),
    kind,
    factId: text(reaction, 'fato_id'),
    base: 0.0,
  })
}
