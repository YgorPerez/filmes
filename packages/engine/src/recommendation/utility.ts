// A Presente's individual utility of a film, from 0 to 1, or unknown (null)
// with no Evidence backed by a Fact (`recomendacao/utilidade.py`).
//
// Only the `[utility] max_evidence` contributions of largest magnitude go in
// the sum; a Já visto [seen] is outside that cut and always counts. Without
// the cut, someone with a thousand Notas gets dozens of Evidence per film
// and saturates at 1.

import { pyExp } from '../compat/exp.ts'
import { pySum } from '../compat/number.ts'
import { contribution, type Evidence } from '../evidence/Evidence.ts'
import type { Weights } from '../runtime/Weights.ts'

/** Larger magnitude first; equal ones keep their order (Python's stable
 * `sorted(key=abs, reverse=True)`). */
const byMagnitude = (a: number, b: number): number =>
  Math.abs(a) > Math.abs(b) ? -1 : Math.abs(a) < Math.abs(b) ? 1 : 0

/** The utility of a Presente's Evidence on one film: the sigmoid
 * `1 / (1 + exp(-k × sum))`, or `null` when only guesses back it. */
export const individualUtility = (
  evidence: ReadonlyArray<Evidence>,
  weights: Pick<Weights, 'strength' | 'utility'>,
): number | null => {
  const withFact = evidence.filter((e) => e.kind !== 'guess')
  if (withFact.length === 0) return null
  const strongest = withFact
    .filter((e) => !e.seen)
    .map((e) => contribution(e, weights))
    .sort(byMagnitude)
    .slice(0, weights.utility.max_evidence)
  const sum =
    pySum(strongest) +
    pySum(withFact.filter((e) => e.seen).map((e) => contribution(e, weights)))
  return 1 / (1 + pyExp(-weights.utility.k * sum))
}
