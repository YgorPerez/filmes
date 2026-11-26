// The grid of path weights and Força multipliers (`avaliacao/grade.py`).
//
// The multipliers vary together (a product). The path weights vary one at a
// time: with five predicates the full product would give 243 sets of path
// weights for each set of multipliers, and the grid would stop being small.
// The N of the strongest-Evidence cut (`[utility] max_evidence`) varies on
// its own, with the rest as the config has it (#57), and so does the
// half-life of the Decaimento (`[rating_decay] half_life_years`, #173).
//
// The order of the combinations follows Python's, which walks the path
// weights by their Portuguese names (`diretor, elenco, genero, roteiro,
// serie`): the best three are sorted stably, so the order breaks ties.

import { compareTuple } from '../compat/compare.ts'
import { pyMean } from '../compat/mean.ts'
import { pyRound } from '../compat/number.ts'
import type { Weights } from '../runtime/Weights.ts'
import { LINK_PREDICATE } from '../sqlite/vocabulary.ts'
import type { Measures } from './offline.ts'

export const MAX_EVIDENCE = [3, 5, 8, 10] as const

/** The Decaimento half-lives tried, in years (#173). */
export const HALF_LIFE_YEARS = [2.5, 5, 10, 20] as const

/** The Forças, weakest first (Python's `FORCAS`). */
const STRENGTHS = ['weak', 'moderate', 'strong'] as const

type Section =
  | 'path.weight'
  | 'strength.multiplier'
  | 'utility'
  | 'rating_decay'

/** The values tried, by section and key (`valores`). Keys are the EN
 * config keys. */
export type GridSpace = Readonly<
  Record<Section, ReadonlyMap<string, readonly number[]>>
>

const variations = (value: number): readonly number[] =>
  value === 0
    ? [0, 0.25, 0.5]
    : [pyRound(0.75 * value, 12), value, pyRound(1.25 * value, 12)]

const portugueseName = (link: string): string =>
  (LINK_PREDICATE as Readonly<Record<string, string>>)[link] ?? link

export const gridSpace = (weights: Weights): GridSpace => ({
  'path.weight': new Map(
    Object.keys(weights.path.weight)
      .sort((a, b) => compareTuple([portugueseName(a)], [portugueseName(b)]))
      .map((link) => [link, variations(weights.path.weight[link]!)]),
  ),
  'strength.multiplier': new Map(
    STRENGTHS.map((s) => [s, variations(weights.strength.multiplier[s])]),
  ),
  utility: new Map([['max_evidence', MAX_EVIDENCE]]),
  rating_decay: new Map([['half_life_years', HALF_LIFE_YEARS]]),
})

const withValue = (
  weights: Weights,
  section: Section,
  key: string,
  value: number,
): Weights => {
  switch (section) {
    case 'path.weight':
      return {
        ...weights,
        path: {
          ...weights.path,
          weight: { ...weights.path.weight, [key]: value },
        },
      }
    case 'strength.multiplier':
      return {
        ...weights,
        strength: {
          ...weights.strength,
          multiplier: { ...weights.strength.multiplier, [key]: value },
        },
      }
    case 'utility':
      return { ...weights, utility: { ...weights.utility, [key]: value } }
    case 'rating_decay':
      return {
        ...weights,
        rating_decay: { ...weights.rating_decay, [key]: value },
      }
  }
}

const sameMultipliers = (a: Weights, b: Weights): boolean =>
  (['strong', 'moderate', 'weak', 'guess'] as const).every(
    (s) => a.strength.multiplier[s] === b.strength.multiplier[s],
  )

/** Deep equality of two weight sets (Python's `config == pesos`). */
export const sameWeights = (a: unknown, b: unknown): boolean => {
  if (a === b) return true
  if (
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    a === null ||
    b === null
  )
    return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  return (
    keysA.length === keysB.length &&
    keysA.every(
      (k) =>
        Object.hasOwn(b, k) &&
        sameWeights(
          (a as Record<string, unknown>)[k],
          (b as Record<string, unknown>)[k],
        ),
    )
  )
}

/** `combinacoes`: every weight set of the grid, in Python's order. */
export const combinations = (weights: Weights, space: GridSpace): Weights[] => {
  const parameters = (Object.keys(space) as Section[]).flatMap((section) =>
    [...space[section]].map(([key, options]) => ({ section, key, options })),
  )
  const out: Weights[] = []
  const walk = (at: number, config: Weights) => {
    if (at === parameters.length) {
      const strengths = config.strength.multiplier
      const pathsChanged = Object.entries(config.path.weight).filter(
        ([link, value]) => value !== weights.path.weight[link],
      ).length
      // The cut's N and the half-life each vary alone.
      const aloneChanged =
        Number(config.utility.max_evidence !== weights.utility.max_evidence) +
        Number(
          config.rating_decay.half_life_years !==
            weights.rating_decay.half_life_years,
        )
      if (
        aloneChanged > 1 ||
        (aloneChanged === 1 &&
          (pathsChanged || !sameMultipliers(config, weights)))
      )
        return
      if (
        strengths.weak <= strengths.moderate &&
        strengths.moderate <= strengths.strong &&
        pathsChanged <= 1
      )
        out.push(config)
      return
    }
    const { section, key, options } = parameters[at]!
    for (const value of options)
      walk(at + 1, withValue(config, section, key, value))
  }
  walk(0, weights)
  return out
}

/** The offline result of one weight set: by sample. */
export interface OfflineResult {
  readonly people: Measures
  readonly movielens: Measures
}

/** One of the best weight sets (`melhores`), EN keys of the output. */
export interface GridEntry {
  readonly weights: {
    readonly 'path.weight': Readonly<Record<string, number>>
    readonly 'strength.multiplier': Weights['strength']['multiplier']
    readonly utility: { readonly max_evidence: number }
    readonly rating_decay: { readonly half_life_years: number }
  }
  readonly recall50: number | null
  readonly coverageTop5: number | null
  readonly offline: OfflineResult | Record<string, never>
}

const meanOf = (
  offline: OfflineResult | Record<string, never>,
  metric: 'recall50' | 'coverageTop5',
): number | null => {
  const values = Object.values(offline)
    .map((m) => m[metric])
    .filter((v): v is number => v !== null)
  return values.length ? pyMean(values) : null
}

const entry = (
  config: Weights,
  offline: OfflineResult | Record<string, never>,
): GridEntry => ({
  weights: {
    'path.weight': config.path.weight,
    'strength.multiplier': config.strength.multiplier,
    utility: { max_evidence: config.utility.max_evidence },
    rating_decay: {
      half_life_years: config.rating_decay.half_life_years,
    },
  },
  recall50: meanOf(offline, 'recall50'),
  coverageTop5: meanOf(offline, 'coverageTop5'),
  offline,
})

/** `melhores`: the three best by mean Recall@50 across the samples, then
 * mean coverage in the top 5, then fewest changed weights. */
export const best = (
  weights: Weights,
  results: ReadonlyArray<readonly [Weights, OfflineResult]>,
): GridEntry[] => {
  const original = entry(weights, {}).weights as unknown as Record<
    string,
    Record<string, number>
  >
  const key = (e: GridEntry) => {
    let changed = 0
    for (const [section, values] of Object.entries(e.weights) as Array<
      [string, Record<string, number>]
    >)
      for (const [name, value] of Object.entries(values))
        if (value !== original[section]![name]) changed += 1
    return [-(e.recall50 ?? -1), -(e.coverageTop5 ?? -1), changed]
  }
  return results
    .map(([config, offline]) => entry(config, offline))
    .map((e) => ({ e, key: key(e) }))
    .sort((a, b) => compareTuple(a.key, b.key))
    .slice(0, 3)
    .map(({ e }) => e)
}
