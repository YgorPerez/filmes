// The seeded requests: #84's generator shape (`oracle/real/plan.ts` on
// ticket/84-real-oracle: mulberry32, the Regra cycled, a Clima 60% of the
// time, the restriction sets none / each alone / each pair, cycled), with
// #124's Presentes: 3 to 5 (capped by how many Pessoas the database has).
// Only the first step of each scenario: `recomendar` itself.

import type { RecommendRequest } from '../../packages/engine/src/recommendation/recommend.ts'

export function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Fields = Omit<RecommendRequest, 'attendees'>

interface Picker {
  readonly int: (low: number, high: number) => number
  readonly one: <A>(items: readonly A[]) => A
  readonly some: <A>(items: readonly A[], low: number, high: number) => A[]
  readonly chance: (p: number) => boolean
}

const RESTRICTIONS: ReadonlyArray<(p: Picker, references: readonly string[]) => Fields> = [
  (p) => ({ maxDuration: p.int(80, 180) }),
  (p) => ({ since: p.int(1950, 2015) }),
  (p) => ({ until: p.int(1970, 2024) }),
  (p) => ({ language: p.one(['pt', 'en', 'fr', 'ja', 'português']) }),
  () => ({ unseen: true }),
  () => ({ noSlow: true }),
  () => ({ noSad: true }),
  (p) => ({ child: p.chance(0.2) ? 0 : p.int(3, 15) }),
  (p) => ({ triggers: [p.one(['a dog dies', 'a cat dies'])] }),
  (p, references) => ({ similar: p.some(references, 1, 2) }),
]

export const RESTRICTION_SETS: readonly (readonly number[])[] = [
  [],
  ...RESTRICTIONS.map((_, i) => [i]),
  ...RESTRICTIONS.flatMap((_, i) => RESTRICTIONS.slice(i + 1).map((_, k) => [i, i + 1 + k])),
]

export interface Inputs {
  readonly people: readonly string[]
  readonly moods: readonly string[]
  readonly references: readonly string[]
}

const RULES = ['default', 'average', 'by'] as const

export function requests(inputs: Inputs, seed: number, count: number): RecommendRequest[] {
  const next = random(seed)
  const int = (low: number, high: number) => low + Math.floor(next() * (high - low + 1))
  const one = <A,>(items: readonly A[]): A => items[int(0, items.length - 1)] as A
  const some = <A,>(items: readonly A[], low: number, high: number): A[] => {
    const pool = [...items]
    const out: A[] = []
    for (let n = int(low, Math.min(high, pool.length)); n > 0; n--)
      out.push(...pool.splice(int(0, pool.length - 1), 1))
    return out
  }
  const pick: Picker = { int, one, some, chance: (p) => next() < p }
  const out: RecommendRequest[] = []
  for (let i = 0; i < count; i++) {
    const attendees = some(inputs.people, 3, 5)
    const rule = RULES[i % RULES.length] as (typeof RULES)[number]
    let request: RecommendRequest = { attendees, count: 20 }
    if (rule !== 'default' || pick.chance(0.3)) request = { ...request, rule }
    if (rule === 'by') request = { ...request, by: one(attendees) }
    if (pick.chance(0.6)) request = { ...request, moods: some(inputs.moods, 1, 2) }
    for (const r of RESTRICTION_SETS[i % RESTRICTION_SETS.length] ?? [])
      request = { ...request, ...RESTRICTIONS[r]?.(pick, inputs.references) }
    out.push(request)
  }
  return out
}
