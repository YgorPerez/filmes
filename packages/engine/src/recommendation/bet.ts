// The Aposta [bet] (#178): one place of the Recomendação, `[bet] position`,
// goes to a Candidate the Regra left out, with a good Nota prevista and
// little Evidence: what the taste neighbours like and nobody knows yet.
//
// Thompson sampling over the prediction's uncertainty: each Presente with
// a Nota prevista draws a Nota from Normal(value, deviation / √raters),
// and the film with the largest mean draw wins. A sure prediction draws
// its own value; an uncertain one sometimes beats a better sure one. The
// draws come from a hash of the seed (the Session id), the film and the
// Presente, so redoing a Session draws the same, and a film leaving does
// not change the others' draws.

import { createHash } from 'node:crypto'
import { pySum } from '../compat/number.ts'
import { makeEvidence, type Evidence } from '../evidence/Evidence.ts'
import { guessStrength } from '../evidence/ruler.ts'
import type { Weights } from '../runtime/Weights.ts'
import type { BetRecord } from '../sessions/bet-record.ts'
import { NEUTRAL_UTILITY } from './rule.ts'
import { TASTE_NEIGHBORS_TABLE } from './signals/taste-neighbors.ts'

export const CAUTIOUS_BET_REASON =
  'O histórico de apostas do grupo pediu uma nota prevista mais alta.'

export const cautiousBetLine = (filmId: string): Evidence =>
  makeEvidence({
    person: null,
    filmId,
    text: CAUTIOUS_BET_REASON,
    source: null,
    date: null,
    strength: guessStrength(),
    kind: 'guess',
    factId: null,
    base: 0,
    countsAsFact: false,
  })

/** What a Presente's Nota prevista says about a film, for the draw. */
export interface BetOdds {
  /** 1 to 10. */
  readonly value: number
  /** The standard deviation among the neighbours, 1 to 10. */
  readonly deviation: number
  /** How many neighbours rated it. */
  readonly raters: number
}

/** A film that may be the bet: the odds of each Presente with a Nota
 * prevista. */
export interface BetCandidate {
  readonly id: string
  readonly odds: ReadonlyMap<string, BetOdds>
}

const mean = (values: ReadonlyArray<number>): number =>
  pySum(values) / values.length

/** Two uniforms in (0, 1) from 48 bits each of the key's SHA-256. */
const uniforms = (key: string): readonly [number, number] => {
  const hash = createHash('sha256').update(key).digest()
  const unit = (offset: number) => (hash.readUIntBE(offset, 6) + 0.5) / 2 ** 48
  return [unit(0), unit(6)]
}

/** A standard normal draw for one film and Presente (Box–Muller). */
const normal = (seed: string, filmId: string, person: string): number => {
  const [u, v] = uniforms(`${seed}\u0000${filmId}\u0000${person}`)
  return standardNormal(u, v)
}

const standardNormal = (u: number, v: number): number =>
  Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)

/** Marsaglia–Tsang gamma sampling. Work in logs so small prior shapes
 * can still be compared when their gamma samples underflow. */
const logGamma = (shape: number, uniform: () => number): number => {
  if (shape < 1)
    return logGamma(shape + 1, uniform) + Math.log(uniform()) / shape
  const d = shape - 1 / 3
  const c = 1 / Math.sqrt(9 * d)
  for (;;) {
    const x = standardNormal(uniform(), uniform())
    const root = 1 + c * x
    if (root <= 0) continue
    const v = root ** 3
    const u = uniform()
    if (
      u < 1 - 0.0331 * x ** 4 ||
      Math.log(u) < (x * x) / 2 + d * (1 - v + Math.log(v))
    )
      return Math.log(d) + Math.log(v)
  }
}

/** Decide whether the group gets a bet and raise the individual floor
 * for a Presente whose posterior mean has fallen below the prior mean,
 * or lower it for one whose mean has risen. */
export const betPolicy = (
  seed: string,
  attendees: ReadonlyArray<string>,
  records: ReadonlyMap<string, BetRecord>,
  weights: Weights['bet'],
) => {
  const floors = new Map<string, number>()
  if (records.size === 0) return { offer: true, floors }
  const { prior_successes, prior_failures } = weights
  const priorMean = prior_successes / (prior_successes + prior_failures)
  const draws = attendees.map((person) => {
    const record = records.get(person)
    const a = prior_successes + (record?.successes ?? 0)
    const b = prior_failures + (record?.failures ?? 0)
    const posteriorMean = a / (a + b)
    const { min_predicted, min_predicted_floor, max_predicted_increase } =
      weights
    if (posteriorMean < priorMean) {
      const shift = max_predicted_increase * (1 - posteriorMean / priorMean)
      floors.set(person, min_predicted + shift)
    } else if (
      posteriorMean > priorMean &&
      min_predicted > min_predicted_floor
    ) {
      const shift =
        (max_predicted_increase * (posteriorMean - priorMean)) / (1 - priorMean)
      floors.set(person, Math.max(min_predicted_floor, min_predicted - shift))
    }
    let draw = 0
    const uniform = () =>
      uniforms(`bet-record\u0000${seed}\u0000${person}\u0000${draw++}`)[0]
    const success = logGamma(a, uniform)
    const failure = logGamma(b, uniform)
    return 1 / (1 + Math.exp(failure - success))
  })
  return { offer: mean(draws) >= weights.min_success_rate, floors }
}

/** The films whose mean Nota prevista reaches `minPredicted`, by their
 * draw, the largest first; on a tie, by id. */
export const drawBets = (
  seed: string,
  candidates: ReadonlyArray<BetCandidate>,
  minPredicted: number,
  floors: ReadonlyMap<string, number> = new Map(),
): ReadonlyArray<string> =>
  candidates
    .filter((candidate) => {
      const odds = [...candidate.odds]
      if (odds.length === 0) return false
      const minimum = (person: string) => floors.get(person) ?? minPredicted
      // Relax the original group average by the minimums that went down.
      // A minimum that went up is still a requirement for that Presente.
      return (
        mean(odds.map(([, o]) => o.value)) >=
          minPredicted +
            mean(
              odds.map(([person]) =>
                Math.min(0, minimum(person) - minPredicted),
              ),
            ) &&
        odds.every(
          ([person, o]) =>
            minimum(person) <= minPredicted || o.value >= minimum(person),
        )
      )
    })
    .map((c) => ({
      id: c.id,
      draw: mean(
        [...c.odds].map(
          ([person, o]) =>
            o.value +
            (o.deviation / Math.sqrt(o.raters)) * normal(seed, c.id, person),
        ),
      ),
    }))
    .toSorted((a, b) => b.draw - a.draw || (a.id < b.id ? -1 : 1))
    .map((c) => c.id)

/** Little Evidence: no Presente saw the film, none has a utility below
 * the neutral one, and the Presentes have at most `max_facts` Facts on it
 * apart from the taste neighbours' own line. */
export const hasLittleEvidence = (
  evidence: ReadonlyArray<Evidence>,
  utilities: ReadonlyMap<string, number | null>,
  weights: Pick<Weights, 'bet'>,
): boolean => {
  if (evidence.some((e) => e.seen)) return false
  if ([...utilities.values()].some((u) => u !== null && u < NEUTRAL_UTILITY))
    return false
  const facts = evidence.filter(
    (e) =>
      e.kind !== 'guess' &&
      e.countsAsFact &&
      !e.factId?.startsWith(`${TASTE_NEIGHBORS_TABLE}:`),
  )
  return facts.length <= weights.bet.max_facts
}
