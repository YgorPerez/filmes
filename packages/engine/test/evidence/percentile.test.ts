// The ruler reads a Nota by its percentile on the Pessoa's scale (#172):
// her own Notas, or the MovieLens population's below a minimum.
import { describe, expect, test } from 'vite-plus/test'
import {
  ratingPercentile,
  ratingScale,
  ratingStrength,
  type RatingPercentile,
} from '../../src/index.ts'

/** The cut points of `config/weights.toml`. */
const CUTS: RatingPercentile = {
  min_ratings: 10,
  strong: 0.9,
  moderate: 0.7,
  weak: 0.4,
  weak_against: 0.2,
  moderate_against: 0.1,
}

const TODAY = '2026-11-20'
const RECENT = '2026-01-01'

/** Counts by value from a list of Notas. */
const counts = (ratings: readonly number[]): Map<number, number> => {
  const out = new Map<number, number>()
  for (const r of ratings) out.set(r, (out.get(r) ?? 0) + 1)
  return out
}

// Ten Notas of someone who gives 4 or more to almost everything.
const ENTHUSIAST = counts([5, 5, 5, 5, 4.5, 4.5, 4, 4, 4, 2])

describe('the percentile of a Nota', () => {
  test('is the share of her Notas below it plus half of the equal ones', () => {
    const scale = ratingScale(ENTHUSIAST, new Map(), CUTS)
    expect(ratingPercentile(scale, 5)).toBeCloseTo(0.8)
    expect(ratingPercentile(scale, 4.5)).toBeCloseTo(0.5)
    expect(ratingPercentile(scale, 4)).toBeCloseTo(0.25)
    expect(ratingPercentile(scale, 2)).toBeCloseTo(0.05)
  })

  test('is one half on an empty scale', () => {
    expect(ratingPercentile(ratingScale(new Map(), new Map(), CUTS), 3)).toBe(
      0.5,
    )
  })
})

describe('the Força of a Nota by its percentile', () => {
  test('an enthusiast’s 4 speaks against the film, and her 5 is not strong', () => {
    const scale = ratingScale(ENTHUSIAST, new Map(), CUTS)
    expect(ratingStrength(scale, 5, RECENT, TODAY)).toEqual(['moderate', 1])
    expect(ratingStrength(scale, 4.5, RECENT, TODAY)).toEqual(['weak', 1])
    expect(ratingStrength(scale, 4, RECENT, TODAY)).toEqual(['weak', -1])
    expect(ratingStrength(scale, 2, RECENT, TODAY)).toEqual(['strong', -1])
  })

  test('her top 10% is strong, whatever the value', () => {
    const scale = ratingScale(
      counts([3.5, 3, 3, 3, 2.5, 2.5, 2, 2, 1.5, 1]),
      new Map(),
      CUTS,
    )
    expect(ratingStrength(scale, 3.5, RECENT, TODAY)).toEqual(['strong', 1])
    // 1 is the bottom 5%: strong against; 2 sits at 30%: weak against.
    expect(ratingStrength(scale, 1, RECENT, TODAY)).toEqual(['strong', -1])
    expect(ratingStrength(scale, 2, RECENT, TODAY)).toEqual(['weak', -1])
  })

  test('age and Feedback still move the level read from the percentile', () => {
    const scale = ratingScale(ENTHUSIAST, new Map(), CUTS)
    expect(ratingStrength(scale, 5, '2019-01-01', TODAY)).toEqual(['weak', 1])
    expect(ratingStrength(scale, 5, RECENT, TODAY, true)).toEqual(['strong', 1])
  })
})

describe('the scale of a Pessoa with few Notas', () => {
  // A population where 4 sits at the 75th percentile and 5 at the 95th.
  const POPULATION = counts([5, 4, 4, 4, 3, 3, 3, 3, 3, 3])

  test('below the minimum, her Nota is read on the MovieLens population', () => {
    const guest = ratingScale(counts([4, 5, 5]), POPULATION, CUTS)
    expect(guest.source).toBe('population')
    // On her own three Notas, 4 would sit at 1/6: against.
    expect(ratingStrength(guest, 4, RECENT, TODAY)).toEqual(['moderate', 1])
    expect(ratingStrength(guest, 5, RECENT, TODAY)).toEqual(['strong', 1])
  })

  test('from the minimum on, her own Notas', () => {
    expect(ratingScale(ENTHUSIAST, POPULATION, CUTS).source).toBe('own')
  })

  test('with no population in the Catálogo, her own Notas, however few', () => {
    const guest = ratingScale(counts([4, 5, 5]), new Map(), CUTS)
    expect(guest.source).toBe('own')
    expect(ratingStrength(guest, 4, RECENT, TODAY)).toEqual(['moderate', -1])
  })
})
