// The Força [strength] ruler: how strong each Evidence is, by its Tipo, its
// value and, for a Declarado or Relato, its age (`evidencia/regua.py`, issue
// #7). Fixed rules; the numbers that are calibrated live in `weights.toml`,
// the percentile cuts of a Nota (#172) and its Decaimento (`decay.ts`, #173)
// among them. The strength of an Evidence comes only from here.

import { pythonError } from '../compat/python-error.ts'
import type { Weights } from '../runtime/Weights.ts'
import { STRENGTHS, type Strength } from './strength.ts'

/** MovieLens's "gave 4+" (the item-item neighbourhood and the evaluation's
 * hit), and the stated rating that counts as high ("ama" is 5). A Nota is
 * high by its percentile instead (`isHighRating`). */
export const HIGH_RATING = 4.0
/** A Declarado or Relato older than this many years drops one level. */
export const STATED_YEARS = 2
export const SEEN_STRENGTH: Strength = 'strong'
export const MIN_NEIGHBOR_BASE = 30
export const MIN_NEIGHBOR_PERCENT = 25

/** One level down; weak stays weak. */
export const weaken = (strength: Strength): Strength =>
  STRENGTHS[Math.max(0, STRENGTHS.indexOf(strength) - 1)] ?? strength

/** One level up; strong stays strong. */
export const strengthen = (strength: Strength): Strength =>
  STRENGTHS[Math.min(STRENGTHS.length - 1, STRENGTHS.indexOf(strength) + 1)] ??
  strength

/** The weaker of two; the first on a tie (Python's `min`). */
const weaker = (a: Strength, b: Strength): Strength =>
  STRENGTHS.indexOf(b) < STRENGTHS.indexOf(a) ? b : a

/** +1 when the Fact speaks for the film, -1 against. */
export type Direction = 1 | -1

/** `[rating_percentile]`: the minimum of own Notas and the cut points. */
export type RatingPercentile = Weights['rating_percentile']

/** The Notas a Nota is read against (Escala da Pessoa [rating scale]): how
 * many of each value, on the scale of 0,5 to 5, with the cut points. */
export interface RatingScale {
  readonly counts: ReadonlyMap<number, number>
  readonly cuts: RatingPercentile
  /** Her own Notas, or the MovieLens population's. */
  readonly source: 'own' | 'population'
}

const total = (counts: ReadonlyMap<number, number>): number => {
  let n = 0
  for (const count of counts.values()) n += count
  return n
}

/** The Pessoa's scale: her own Notas from `min_ratings` on, or with no
 * population to fall back on; the population's below. */
export const ratingScale = (
  own: ReadonlyMap<number, number>,
  population: ReadonlyMap<number, number>,
  cuts: RatingPercentile,
): RatingScale =>
  total(own) >= cuts.min_ratings || total(population) === 0
    ? { counts: own, cuts, source: 'own' }
    : { counts: population, cuts, source: 'population' }

/** Percentil da Nota [rating percentile]: the share of the scale's Notas
 * below `rating`, plus half of the equal ones, from 0 to 1. One half on an
 * empty scale. */
export const ratingPercentile = (
  scale: RatingScale,
  rating: number,
): number => {
  const n = total(scale.counts)
  if (n === 0) return 0.5
  let below = 0
  let equal = 0
  for (const [value, count] of scale.counts) {
    if (value < rating) below += count
    else if (value === rating) equal += count
  }
  return (below + equal / 2) / n
}

/** The Nota of the scale at percentile `p`, the inverse of
 * `ratingPercentile`: a value of the scale where `p` is its percentile,
 * and between two values the point on the line between them; below the
 * lowest or above the highest, that value. `null` on an empty scale. */
export const ratingAtPercentile = (
  scale: RatingScale,
  p: number,
): number | null => {
  const points = [...scale.counts.keys()]
    .sort((a, b) => a - b)
    .map((value) => [value, ratingPercentile(scale, value)] as const)
  const [first, last] = [points[0], points.at(-1)]
  if (first === undefined || last === undefined) return null
  if (p <= first[1]) return first[0]
  if (p >= last[1]) return last[0]
  const above = points.findIndex(([, q]) => q >= p)
  const [low, lowP] = points[above - 1]!
  const [high, highP] = points[above]!
  return low + ((high - low) * (p - lowP)) / (highP - lowP)
}

/** Below this many taste neighbours with a rating of the film, they say
 * nothing about it (`tasteNeighborsStrength`). */
export const MIN_TASTE_RATERS = 3

/** The taste neighbours on a film: `raters` of them rated it, the standard
 * deviation of their percentiles is `spread` (0 when they all agree), and
 * they share `overlap` films with the Pessoa on average.
 *
 * Strong with 10+ neighbours, spread up to 0.15 and 30+ films shared;
 * moderate with 5+, spread up to 0.25 and 15+ shared; weak with 3 or more.
 * Fewer than 3 give no Evidence. */
export const tasteNeighborsStrength = (
  raters: number,
  spread: number,
  overlap: number,
): Strength | null => {
  const steps: ReadonlyArray<readonly [Strength, number, number, number]> = [
    ['strong', 10, 0.15, 30],
    ['moderate', 5, 0.25, 15],
    ['weak', MIN_TASTE_RATERS, Infinity, 0],
  ]
  for (const [strength, minRaters, maxSpread, minOverlap] of steps)
    if (raters >= minRaters && spread <= maxSpread && overlap >= minOverlap)
      return strength
  return null
}

/** Nota alta [high rating]: in favour, moderate or strong, by the
 * percentile alone (age and Feedback do not count). */
export const isHighRating = (scale: RatingScale, rating: number): boolean =>
  ratingPercentile(scale, rating) >= scale.cuts.moderate

/** The level of a Nota by its percentile on the Pessoa's scale. */
const ratingLevel = (
  scale: RatingScale,
  rating: number,
): [Strength, Direction] => {
  const p = ratingPercentile(scale, rating)
  const cuts = scale.cuts
  if (p >= cuts.strong) return ['strong', 1]
  if (p >= cuts.moderate) return ['moderate', 1]
  if (p >= cuts.weak) return ['weak', 1]
  if (p >= cuts.weak_against) return ['weak', -1]
  if (p >= cuts.moderate_against) return ['moderate', -1]
  return ['strong', -1]
}

/** Strength and direction of a Nota [rating] on a similar film.
 *
 * By its percentile on the Pessoa's scale and the cuts of
 * `[rating_percentile]`: her top 10% is strong in favour. From a Session's
 * Feedback, it goes up one level, up to strong. Age does not change it: the
 * Decaimento lowers the Nota's contribution instead (`decay.ts`, #173). */
export const ratingStrength = (
  scale: RatingScale,
  rating: number,
  fromFeedback = false,
): readonly [Strength, Direction] => {
  const [strength, direction] = ratingLevel(scale, rating)
  return [fromFeedback ? strengthen(strength) : strength, direction]
}

/** Where a seed rating came from: a Session's Feedback, or an answer to
 * the Perguntas par a par (`notas.par_a_par`). */
export interface SeedOrigin {
  readonly fromFeedback?: boolean
  readonly pairwise?: boolean
}

/** The Tipo of a seed rating: a Nota, or a rating stated by the Pessoa
 * ("love" is 5, "hate" is 1) or told by the Dono. */
export type SeedKind = 'rating' | 'stated' | 'report'

/** Strength and direction of a seed rating of any Tipo. A Nota follows the
 * Nota ruler; a stated or reported one follows the specific Declarado and
 * the Relato rulers. A Nota from a pairwise answer only says which of two
 * films she liked more: weak in favour, whatever its percentile. */
export const seedStrength = (
  kind: SeedKind,
  scale: RatingScale,
  rating: number,
  date: string,
  today: string,
  origin: SeedOrigin = {},
): readonly [Strength, Direction] => {
  if (kind !== 'rating')
    return [statedStrength(kind, true, date, today), rating >= 3 ? 1 : -1]
  if (origin.pairwise === true) return ['weak', 1]
  return ratingStrength(scale, rating, origin.fromFeedback)
}

/** Strength of a Feedback reaction (a Nota or a Relato) on the chosen film.
 *
 * A Nota: the Nota ruler, one level up. A Relato speaks of the film itself,
 * so its Declarado would be specific (strong); the Relato is one level below,
 * drops one more after 2 years and goes up one for coming from Feedback. */
export const feedbackStrength = (
  kind: 'rating' | 'report',
  scale: RatingScale,
  rating: number,
  date: string,
  today: string,
): Strength =>
  kind === 'rating'
    ? ratingStrength(scale, rating, true)[0]
    : strengthen(statedStrength('report', true, date, today))

/** Metadata on the taste path: 3 or more high Notas of the Pessoa on the
 * same node is strong, 2 moderate, 1 weak, up to the link's ceiling. None
 * gives no Evidence. */
export const pathStrength = (
  highRatings: number,
  predicate: string,
): Strength | null => {
  if (highRatings <= 0) return null
  const strength: Strength =
    highRatings >= 3 ? 'strong' : highRatings === 2 ? 'moderate' : 'weak'
  return linkStrength(strength, predicate)
}

/** An actor outside the first 3 IMDb credits (supporting, `principal`
 * false) gives weak at most. Without the film's credits (`null`), the
 * strength stays. */
export const castStrength = (
  strength: Strength,
  principal: boolean | null,
): Strength => (principal === false ? 'weak' : strength)

/** The strongest each content link can be (the Dono's decision of
 * 2026-11-22): the same director or series says more than the same actor. */
export const LINK_CEILING: Readonly<Record<string, Strength>> = {
  director: 'strong',
  series: 'strong',
  writer: 'moderate',
  cast: 'moderate',
  genre: 'weak',
}

/** The weaker of the given strength (the seed's or the node's) and the
 * link's ceiling. A predicate outside the table has no ceiling. */
export const linkStrength = (strength: Strength, predicate: string): Strength =>
  weaker(strength, LINK_CEILING[predicate] ?? 'strong')

/** The strength after the Pessoa's Ajuste [adjustment] to the link: `none`
 * removes the Evidence (null), `low` drops one level, `normal` and `high`
 * leave it (`high` only changes the weight). */
export const adjustedStrength = (
  strength: Strength,
  level: string,
): Strength | null => {
  if (level === 'none') return null
  return level === 'low' ? weaken(strength) : strength
}

/** Item-item neighbourhood review: of `base` people who gave 4+ to the seed
 * film, `both` also gave 4+ to the Candidate.
 *
 * Strong with a base of 500+ and 60% or more, moderate with 100+ and 40%,
 * weak with 30+ and 25%; below that, no Evidence. Never above `ceiling`,
 * the seed's strength. The share is compared in integers. */
export const neighborStrength = (
  base: number,
  both: number,
  ceiling: Strength,
): Strength | null => {
  const steps: ReadonlyArray<readonly [Strength, number, number]> = [
    ['strong', 500, 60],
    ['moderate', 100, 40],
    ['weak', MIN_NEIGHBOR_BASE, MIN_NEIGHBOR_PERCENT],
  ]
  for (const [strength, minBase, percent] of steps) {
    if (base >= minBase && 100 * both >= percent * base) {
      return weaker(strength, ceiling)
    }
  }
  return null
}

/** A MovieLens `tags.csv` review: strong with 10+ distinct users, moderate
 * with 3 to 9; fewer than 3 gives no Evidence. */
export const movielensTagStrength = (users: number): Strength | null =>
  users >= 10 ? 'strong' : users >= MOVIELENS_TAG_MIN_USERS ? 'moderate' : null

/** Below it, a MovieLens tag gives no Evidence (`movielensTagStrength`). */
export const MOVIELENS_TAG_MIN_USERS = 3

/** A Tag Genome review: moderate at most (relevance 0.8 or more), weak
 * from 0.6 to 0.8; below 0.6 no Evidence. It is a model's guess, so it is
 * worth less than a count of users. */
export const genomeStrength = (relevance: number): Strength | null =>
  relevance >= 0.8
    ? 'moderate'
    : relevance >= GENOME_MIN_RELEVANCE
      ? 'weak'
      : null

/** Below it, a Tag Genome relevance gives no Evidence (`genomeStrength`). */
export const GENOME_MIN_RELEVANCE = 0.6

/** Genre metadata that answers a Clima [mood]: weak, because genre is too
 * broad (the same reason that caps it at weak on the taste path). */
export const moodGenreStrength = (): Strength => 'weak'

/** A Declarado that names a film, director, actor or subgenre is specific
 * and strong; a generic one is moderate. A review or tag the Pessoa wrote
 * is a specific Declarado. A Relato is one level below its Declarado. Both
 * drop one level after 2 years. */
export const statedStrength = (
  kind: 'stated' | 'report',
  specific: boolean,
  date: string,
  today: string,
): Strength => {
  let strength: Strength = specific ? 'strong' : 'moderate'
  if (kind === 'report') strength = weaken(strength)
  if (isOlderThan(date, STATED_YEARS, today)) strength = weaken(strength)
  return strength
}

/** A film on the Pessoa's watchlist (Letterboxd or Trakt): she said she
 * wants to see it, about the film itself, but only by putting it on a
 * list. Moderate, whatever its age (#280). */
export const watchlistStrength = (): Strength => 'moderate'

/** The IMDb rating as a film line: exact metadata, strong. The bonus size
 * comes from the rating itself, not from the strength. */
export const imdbRatingStrength = (): Strength => 'strong'

/** A Wikidata award or nomination is exact metadata. */
export const awardStrength = (): Strength => 'strong'

/** The critics' score OMDb gives (Rotten Tomatoes, Metacritic) is the
 * aggregator's own number: exact metadata. The bonus size comes from the
 * score, not from the strength. */
export const criticsStrength = (): Strength => 'strong'

/** The "parecido com X" line of a similar request: the project's reading
 * of tags and neighbours, weak. Not a Fact, and adds to nothing. */
export const similarStrength = (): Strength => 'weak'

/** Metadata that answers the request (duration, rating, language, trigger):
 * always strong. */
export const requestMetadataStrength = (): Strength => 'strong'

/** A Palpite [guess], a Motivo with no Fact: always weak. */
export const guessStrength = (): Strength => 'weak'

interface Day {
  readonly year: number
  readonly month: number
  readonly day: number
}

const isLeap = (year: number): boolean =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)

const daysIn = (year: number, month: number): number =>
  month === 2
    ? isLeap(year)
      ? 29
      : 28
    : [4, 6, 9, 11].includes(month)
      ? 30
      : 31

/** Python's `date.fromisoformat` on the `YYYY-MM-DD` the engine stores; a
 * string that is not a date is Python's ValueError. */
const parseDay = (text: string): Day => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  const [year, month, day] = (match?.slice(1) ?? []).map(Number)
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysIn(year, month)
  ) {
    throw pythonError('ValueError', `Invalid isoformat string: '${text}'`)
  }
  return { year, month, day }
}

/** Whether `date` is more than `years` years before `today`. On 29 February,
 * the same day `years` back is the 28th when that year has no 29th. */
export const isOlderThan = (
  date: string,
  years: number,
  today: string,
): boolean => {
  const day = parseDay(date)
  const now = parseDay(today)
  const year = now.year - years
  if (year < 1 || year > 9999) {
    throw pythonError('ValueError', `year ${year} is out of range`)
  }
  const limit: Day = {
    year,
    month: now.month,
    day: Math.min(now.day, daysIn(year, now.month)),
  }
  return (
    day.year < limit.year ||
    (day.year === limit.year &&
      (day.month < limit.month ||
        (day.month === limit.month && day.day < limit.day)))
  )
}
