// The Regra de escolha [choice rule]: how a Session joins its Presentes'
// utilities to order the films (`recomendacao/regra.py`).
//
// A Presente with no Fact about the film (utility `null`) counts as neutral,
// 0.5. A film with no known utility for anyone has no key and goes last.
//
// - `default`: the lowest utility, ties broken by the mean.
// - `average`: the plain mean.
// - `by` someone: only that Pessoa's utility. Everyone's Vetos and
//   Restrições still hold, because they remove films before the order.
//
// The Satisfação [satisfaction] only enters the default rule, as
// `u' = u − factor × (highest − hers)`: the adjustment carries that for each
// Pessoa behind the most satisfied. It does not touch the 0.5 of someone
// with no Fact.

import { pySum } from '../compat/number.ts'
import { pythonError } from '../compat/python-error.ts'

export const RULE_NAMES = ['default', 'average', 'by'] as const
export type RuleName = (typeof RULE_NAMES)[number]

export type Rule =
  | { readonly name: 'default' | 'average' }
  | { readonly name: 'by'; readonly person: string }

/** The utility of someone with no Fact about the film (#37). */
export const NEUTRAL_UTILITY = 0.5

export const DEFAULT_RULE: Rule = { name: 'default' }

/** Only the default rule weighs the satisfaction. */
export const usesSatisfaction = (rule: Rule): boolean => rule.name === 'default'

/** Python's `min`: the first of the smallest. */
const minimum = (values: ReadonlyArray<number>): number =>
  values.reduce((best, value) => (value < best ? value : best))

/** The rule's key for one film, larger is better; `null` when nobody has a
 * known utility. `utilities` is by Presente, in the request's order. */
export const ruleKey = (
  rule: Rule,
  utilities: ReadonlyMap<string, number | null>,
  adjustment?: ReadonlyMap<string, number>,
): readonly number[] | null => {
  if ([...utilities.values()].every((u) => u === null)) return null
  let counted: ReadonlyArray<readonly [string, number | null]> = [...utilities]
  if (rule.name === 'by') {
    const utility = utilities.get(rule.person)
    if (utility === undefined) {
      throw pythonError('KeyError', `'${rule.person}'`)
    }
    counted = [[rule.person, utility]]
  }
  const behind: ReadonlyMap<string, number> =
    usesSatisfaction(rule) && adjustment ? adjustment : new Map()
  const values = counted.map(([person, u]) =>
    u === null ? NEUTRAL_UTILITY : u - (behind.get(person) ?? 0),
  )
  const mean = pySum(values) / values.length
  return rule.name === 'default' ? [minimum(values), mean] : [mean]
}

/** The rule as the result prints it. */
export const ruleToJson = (
  rule: Rule,
): { readonly name: RuleName; readonly person?: string } =>
  rule.name === 'by' && rule.person
    ? { name: rule.name, person: rule.person }
    : { name: rule.name }
