// Bet outcomes are derived from Session files. A film carried across
// versions counts once per Presente; another Session can teach it again.

import { Effect } from 'effect'
import { pyFloat } from '../compat/fact-id.ts'
import {
  isMapping,
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
import { ratingValue, reactions } from './facts.ts'
import { readSession, sessionIds, sessionVersions, storedBet } from './file.ts'
import { storedVotes } from './votes.ts'

export interface BetRecord {
  readonly successes: number
  readonly failures: number
}

interface BetMark {
  readonly person: string
  readonly film: string
  readonly rating: number | null
  readonly kind: 'seen' | 'swapped'
  readonly date: string
}

const list = (value: YamlValue | undefined) => (isSequence(value) ? value : [])
const strings = (value: YamlValue | undefined) => list(value).map(pyStrValue)

const betMarks = (version: YamlMapping) =>
  list(version.get('bet_marks'))
    .filter(isMapping)
    .map((mark) => yamlToJson(mark) as BetMark)

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

const sessionOutcomes = (id: string, front: YamlMapping, round: Round) =>
  Effect.gen(function* () {
    const attendees = new Set(round.attendees)
    const shown = new Map<string, Set<string>>()
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

    const versions = sessionVersions(front)
    const marks = versions.map(betMarks)
    const latestSeen = new Map(
      marks
        .flat()
        .filter((mark) => mark.kind === 'seen')
        .map((mark) => [JSON.stringify([mark.person, mark.film]), mark]),
    )
    for (const [index, version] of versions.entries()) {
      const bet = storedBet(version)
      if (bet) {
        const film = pyStrValue(bet.get('id') ?? null)
        const people = shown.get(film) ?? new Set<string>()
        for (const person of strings(version.get('attendees')))
          if (attendees.has(person)) people.add(person)
        shown.set(film, people)
      }
      if (!shown.size) continue
      const date = pyStrValue(version.get('date') ?? null)
      const attributed = new Set<string>()
      for (const vote of storedVotes(version)) {
        if (vote.vote !== 'no') continue
        attributed.add(vote.film)
        put(vote.person, vote.film, { success: false, date: vote.date ?? date })
      }
      for (const mark of marks[index] ?? []) {
        if (mark.kind === 'swapped') {
          attributed.add(mark.film)
          put(mark.person, mark.film, { success: false, date: mark.date })
        } else if (
          latestSeen.get(JSON.stringify([mark.person, mark.film])) === mark &&
          mark.rating !== null &&
          attendees.has(mark.person)
        ) {
          const scale = scaleOf(round, mark.person)
          if (isHighRating(scale, mark.rating))
            put(mark.person, mark.film, { success: true, date: mark.date })
          else if (ratingStrength(scale, mark.rating)[1] < 0)
            put(mark.person, mark.film, { success: false, date: mark.date })
        }
      }
      // Before actor attribution, a Trocar with no corresponding no was
      // the Dono's. A Voto must never also count against the Dono.
      const owner = front.get('owner')
      if (typeof owner === 'string')
        for (const film of strings(version.get('swapped')))
          if (!attributed.has(film)) put(owner, film, { success: false, date })
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
