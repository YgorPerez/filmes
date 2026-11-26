// Bet outcomes are derived from Session files. A film carried across
// versions counts once per Presente; another Session can teach it again.

import { Effect, Schema } from 'effect'
import { pyFloat } from '../compat/fact-id.ts'
import {
  isSequence,
  pyStrValue,
  yamlToJson,
  type YamlMapping,
  type YamlValue,
} from '../data/yaml.ts'
import { ratingDecay } from '../evidence/decay.ts'
import {
  isHighRating,
  ratingAtPercentile,
  ratingStrength,
} from '../evidence/ruler.ts'
import { scaleOf, type Round } from '../recommendation/signals/Signal.ts'
import { num, text } from '../sqlite/row.ts'
import { ratingValue, reactions } from './facts.ts'
import { readSession, sessionIds, sessionVersions, storedBet } from './file.ts'
import { storedVotes } from './votes.ts'

export interface BetRecord {
  readonly successes: number
  readonly failures: number
}

const BetMark = Schema.Struct({
  person: Schema.String,
  film: Schema.String,
  rating: Schema.NullOr(
    Schema.Finite.check(Schema.isBetween({ minimum: 0.5, maximum: 5 })),
  ),
  kind: Schema.Literals(['seen', 'swapped']),
  date: Schema.String,
})
type BetMark = typeof BetMark.Type
const isBetMark = Schema.is(BetMark)

const list = (value: YamlValue | undefined) => (isSequence(value) ? value : [])
const strings = (value: YamlValue | undefined) => list(value).map(pyStrValue)

const betMarks = (version: YamlMapping) =>
  list(version.get('bet_marks')).map(yamlToJson).filter(isBetMark)

/** Record the Dono's Trocar and a rated Já vi on the Session itself.
 * These are the two actions whose attribution or Nota was not otherwise
 * recoverable from its versions. Re-sending a mark keeps its date. */
export const recordBetMarks = (
  front: Map<string, YamlValue>,
  marks: ReadonlyArray<BetMark>,
): boolean => {
  if (marks.length === 0) return false
  const versions = sessionVersions(front)
  const bets = new Set(versions.map((v) => storedBet(v)?.get('id')))
  const earlier = versions.flatMap(betMarks)
  const added: YamlMapping[] = []
  for (const { person, film, kind, rating, date } of marks) {
    if (!bets.has(film)) continue
    const previous = earlier.findLast(
      (m) => m.person === person && m.film === film && m.kind === kind,
    )
    if (previous?.rating === rating) continue
    added.push(
      new Map<string, YamlValue>([
        ['person', person],
        ['film', film],
        ['kind', kind],
        ['rating', rating === null ? null : pyFloat(rating)],
        ['date', date],
      ]),
    )
  }
  if (!added.length) return false
  front.set('bet_marks', [...list(front.get('bet_marks')), ...added])
  return true
}

interface Outcome {
  readonly success: boolean
  readonly date: string
}

const isSeenDrop = Schema.is(
  Schema.Struct({
    cause: Schema.Literal('seen'),
    id: Schema.String,
    people: Schema.Array(Schema.String),
  }),
)

/** The Nota from when the film was on screen. A later re-rating or a
 * Nota from before the film was an Aposta cannot explain this drop. */
const ratingForDrop = (
  round: Round,
  person: string,
  film: string,
  since: string,
  until: string,
) =>
  round.db.get(
    `SELECT nota, data FROM notas
     WHERE pessoa = ? AND filme_id = ? AND tipo = 'nota' AND data BETWEEN ? AND ?
     ORDER BY data DESC, fato_id LIMIT 1`,
    person,
    film,
    since,
    until,
  )

const sessionOutcomes = (id: string, front: YamlMapping, round: Round) =>
  Effect.gen(function* () {
    const attendees = new Set(round.attendees)
    const shown = new Map<string, Map<string, string>>()
    const outcomes = new Map<string, Map<string, Outcome>>()
    const put = (person: string, film: string, outcome: Outcome) => {
      if (
        !shown.get(film)?.has(person) ||
        !Number.isFinite(Date.parse(outcome.date)) ||
        outcome.date > round.today
      )
        return
      const films = outcomes.get(person) ?? new Map<string, Outcome>()
      const previous = films.get(film)
      if (!previous || previous.date <= outcome.date) {
        films.set(film, outcome)
        outcomes.set(person, films)
      }
    }

    const putRating = (
      person: string,
      film: string,
      rating: number,
      date: string,
    ) => {
      const scale = scaleOf(round, person)
      if (isHighRating(scale, rating))
        put(person, film, { success: true, date })
      else if (ratingStrength(scale, rating)[1] < 0)
        put(person, film, { success: false, date })
    }
    const seenKey = (person: string, film: string) =>
      JSON.stringify([person, film])

    const versions = sessionVersions(front)
    const marks = versions.map(betMarks)
    const latestSeen = new Map(
      marks
        .flat()
        .filter((mark) => mark.kind === 'seen')
        .map((mark) => [seenKey(mark.person, mark.film), mark]),
    )
    for (const [index, version] of versions.entries()) {
      const date = pyStrValue(version.get('date') ?? null)
      const bet = storedBet(version)
      if (bet) {
        const film = pyStrValue(bet.get('id') ?? null)
        const people = shown.get(film) ?? new Map<string, string>()
        for (const person of strings(version.get('attendees')))
          if (attendees.has(person) && !people.has(person))
            people.set(person, date)
        shown.set(film, people)
      }
      if (!shown.size) continue
      for (const drop of list(version.get('dropped'))
        .map(yamlToJson)
        .filter(isSeenDrop)) {
        for (const person of drop.people) {
          const since = shown.get(drop.id)?.get(person)
          if (since === undefined || latestSeen.has(seenKey(person, drop.id)))
            continue
          const note = yield* ratingForDrop(round, person, drop.id, since, date)
          if (note !== undefined)
            putRating(person, drop.id, num(note, 'nota'), text(note, 'data'))
        }
      }
      for (const vote of storedVotes(version)) {
        if (vote.vote !== 'no') continue
        put(vote.person, vote.film, { success: false, date: vote.date ?? date })
      }
      for (const mark of marks[index] ?? []) {
        if (mark.kind === 'swapped') {
          put(mark.person, mark.film, { success: false, date: mark.date })
        } else if (
          latestSeen.get(seenKey(mark.person, mark.film)) === mark &&
          mark.rating !== null &&
          attendees.has(mark.person)
        ) {
          putRating(mark.person, mark.film, mark.rating, mark.date)
        }
      }
    }

    const chosen = front.get('chosen')
    if (typeof chosen === 'string' && shown.has(chosen))
      for (const reaction of yield* reactions(id, front)) {
        if (!shown.get(chosen)?.has(reaction.person)) continue
        const median = ratingAtPercentile(scaleOf(round, reaction.person), 0.5)
        if (reaction.value >= (median === null ? 0.5 : ratingValue(median)))
          put(reaction.person, chosen, { success: true, date: reaction.date })
      }
    return outcomes
  })

/** Only other Sessions inform this draw. Redoing this Session still uses
 * the same record and seed, while its own Trocar and Já vi exclude films. */
export const readBetRecord = (round: Round, currentSession?: string) =>
  Effect.gen(function* () {
    const records = new Map<string, BetRecord>()
    const ids = yield* sessionIds.pipe(Effect.orElseSucceed(() => []))
    for (const id of ids) {
      if (id === currentSession) continue
      const history = yield* Effect.gen(function* () {
        const { frontmatter } = yield* readSession(id)
        return yield* sessionOutcomes(id, frontmatter, round)
      }).pipe(Effect.orElseSucceed(() => null))
      if (history === null) continue
      for (const [person, films] of history) {
        let { successes, failures } = records.get(person) ?? {
          successes: 0,
          failures: 0,
        }
        for (const { success, date } of films.values()) {
          const weight = ratingDecay(
            date,
            round.today,
            round.weights.rating_decay,
          )
          if (success) successes += weight
          else failures += weight
        }
        records.set(person, { successes, failures })
      }
    }
    return records
  })
