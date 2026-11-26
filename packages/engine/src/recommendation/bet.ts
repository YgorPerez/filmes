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
import type { Evidence } from '../evidence/Evidence.ts'
import type { Weights } from '../runtime/Weights.ts'
import { NEUTRAL_UTILITY } from './rule.ts'
import { TASTE_NEIGHBORS_TABLE } from './signals/taste-neighbors.ts'

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
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/** The films whose mean Nota prevista reaches `minPredicted`, by their
 * draw, the largest first; on a tie, by id. */
export const drawBets = (
  seed: string,
  candidates: ReadonlyArray<BetCandidate>,
  minPredicted: number,
): ReadonlyArray<string> =>
  candidates
    .filter(
      (c) =>
        c.odds.size > 0 &&
        mean([...c.odds.values()].map((o) => o.value)) >= minPredicted,
    )
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
