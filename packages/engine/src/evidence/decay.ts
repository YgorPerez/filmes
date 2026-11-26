// Decaimento [rating decay] of a Nota (#173): its contribution halves with
// every half-life of age and never drops below the floor, both from
// `[rating_decay]` in `weights.toml`. It replaces the ruler's old step (a
// Nota more than 5 years old dropped one Força level): the Força stays the
// ruler's, by a fixed rule, and only the weight fades. A Declarado, a Relato
// and a Já visto do not decay.

import type { Weights } from '../runtime/Weights.ts'

const DAY_MS = 86_400_000
const YEAR_DAYS = 365.25

/** The factor, from the floor to 1, that multiplies the contribution of a
 * Nota given on `date` (`YYYY-MM-DD`), seen from `today`. A Nota dated
 * after today has not aged. */
export const ratingDecay = (
  date: string,
  today: string,
  decay: Weights['rating_decay'],
): number => {
  const years = (Date.parse(today) - Date.parse(date)) / DAY_MS / YEAR_DAYS
  return Math.max(
    decay.floor,
    Math.min(1, 2 ** (-years / decay.half_life_years)),
  )
}
