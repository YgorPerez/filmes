// The ruler's part of the taste neighbours (#174): a percentile read back
// as a Nota on the Pessoa's scale, and the Força of what the neighbours
// say, by a fixed rule on how many, how much they agree and how much they
// share with her.
import { describe, expect, test } from 'vite-plus/test'
import {
  ratingAtPercentile,
  ratingPercentile,
  ratingScale,
  tasteNeighborsStrength,
  type RatingPercentile,
} from '../../src/index.ts'

const CUTS: RatingPercentile = {
  min_ratings: 10,
  strong: 0.9,
  moderate: 0.7,
  weak: 0.4,
  weak_against: 0.2,
  moderate_against: 0.1,
}

const counts = (ratings: readonly number[]): Map<number, number> => {
  const out = new Map<number, number>()
  for (const r of ratings) out.set(r, (out.get(r) ?? 0) + 1)
  return out
}

// Someone who gives 4 or more to almost everything: 2 is 0.05, 4 is 0.25,
// 4.5 is 0.5, 5 is 0.8.
const ENTHUSIAST = ratingScale(
  counts([5, 5, 5, 5, 4.5, 4.5, 4, 4, 4, 2]),
  new Map(),
  CUTS,
)

describe('the Nota at a percentile', () => {
  test('is the Nota of her scale with that percentile', () => {
    for (const rating of [2, 4, 4.5, 5])
      expect(
        ratingAtPercentile(ENTHUSIAST, ratingPercentile(ENTHUSIAST, rating)),
      ).toBeCloseTo(rating)
  })

  test('between two Notas of her scale, lies on the line between them', () => {
    // Halfway from 4 (0.25) to 4.5 (0.5).
    expect(ratingAtPercentile(ENTHUSIAST, 0.375)).toBeCloseTo(4.25)
  })

  test('beyond her lowest or highest Nota, is that Nota', () => {
    expect(ratingAtPercentile(ENTHUSIAST, 0)).toBe(2)
    expect(ratingAtPercentile(ENTHUSIAST, 0.99)).toBe(5)
  })

  test('the same percentile is a lower Nota for whoever rates lower', () => {
    const harsh = ratingScale(
      counts([1, 2, 2, 3, 3, 3, 3.5, 3.5, 4, 5]),
      new Map(),
      CUTS,
    )
    expect(ratingAtPercentile(harsh, 0.5)).toBeLessThan(
      ratingAtPercentile(ENTHUSIAST, 0.5)!,
    )
  })

  test('on an empty scale, there is none', () => {
    expect(
      ratingAtPercentile(ratingScale(new Map(), new Map(), CUTS), 0.5),
    ).toBeNull()
  })
})

describe('the Força of the taste neighbours', () => {
  test('is strong with many neighbours who agree and share much with her', () => {
    expect(tasteNeighborsStrength(10, 0.15, 30)).toBe('strong')
  })

  test('is moderate with fewer, or with less agreement or overlap', () => {
    expect(tasteNeighborsStrength(9, 0.1, 100)).toBe('moderate')
    expect(tasteNeighborsStrength(20, 0.2, 100)).toBe('moderate')
    expect(tasteNeighborsStrength(20, 0.1, 29)).toBe('moderate')
    expect(tasteNeighborsStrength(5, 0.25, 15)).toBe('moderate')
  })

  test('is weak from 3 neighbours on, whatever they agree or share', () => {
    expect(tasteNeighborsStrength(4, 0.05, 100)).toBe('weak')
    expect(tasteNeighborsStrength(20, 0.3, 100)).toBe('weak')
    expect(tasteNeighborsStrength(20, 0.1, 14)).toBe('weak')
    expect(tasteNeighborsStrength(3, 0.5, 1)).toBe('weak')
  })

  test('gives no Evidence below 3 neighbours', () => {
    expect(tasteNeighborsStrength(2, 0, 100)).toBeNull()
  })
})
