// What the recommendation tests share: the engine's recommendation as an
// edge prints it, the same against the output recorded for the test
// (`expected.ts`), and a weights file with one value changed.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from 'vite-plus/test'
import {
  recommend,
  type Recommendation,
  type RecommendedFilm,
  type RecommendRequest,
  type Vars,
} from '../../src/index.ts'
import { ROOT, type Fixture } from '../fixture.ts'
import { expectRecorded } from '../expected.ts'

/** The engine's recommendation, as JSON (what an edge prints). */
export const engineRecommendation = async (
  fixture: Fixture,
  request: RecommendRequest,
  vars: Vars = {},
): Promise<Recommendation> =>
  JSON.parse(
    JSON.stringify(await fixture.ok(recommend(request), vars)),
  ) as Recommendation

/** The engine's recommendation, checked against the one recorded for the
 * test: the whole output, as the Python engine gave it (`expected.ts`). */
export const expectRecordedRecommendation = async (
  fixture: Fixture,
  request: RecommendRequest,
  vars: Vars = {},
): Promise<Recommendation> => {
  const out = await engineRecommendation(fixture, request, vars)
  expectRecorded(fixture, out)
  return out
}

/** A copy of `config/weights.toml` with `from` replaced by `to`: the
 * engine's `FILMES_PESOS`. */
export const weightsWith = (
  fixture: Fixture,
  from: string,
  to: string,
): Vars => {
  const text = readFileSync(join(ROOT, 'config/weights.toml'), 'utf8')
  if (!text.includes(from)) throw new Error(`weights.toml has no ${from}`)
  const file = join(fixture.root, 'weights-test.toml')
  writeFileSync(file, text.replace(from, to))
  return { FILMES_PESOS: file }
}

/** `config/weights.toml` with `[taste_neighbors]`'s `k` and `min_shared`
 * changed, and `[rating_percentile] min_ratings` when given. */
export const tasteWeights = (
  fixture: Fixture,
  k: number,
  minShared: number,
  minRatings?: number,
): Vars => {
  let text = readFileSync(join(ROOT, 'config/weights.toml'), 'utf8')
  text = text.replace(
    'k = 50\nmin_shared = 10',
    `k = ${k}\nmin_shared = ${minShared}`,
  )
  if (minRatings !== undefined)
    text = text.replace('min_ratings = 20', `min_ratings = ${minRatings}`)
  const file = join(fixture.root, 'weights-test.toml')
  writeFileSync(file, text)
  return { FILMES_PESOS: file }
}

export const titles = (out: Recommendation): string[] =>
  out.films.map((film) => film.title)

export const film = (out: Recommendation, title: string): RecommendedFilm => {
  const found = out.films.filter((f) => f.title === title)
  expect(found).toHaveLength(1)
  return found[0] as RecommendedFilm
}

/** One Presente's Evidence on a film, as (text, strength, kind,
 * contribution). */
export const evidenceOf = (
  out: Recommendation,
  title: string,
  person: string,
): Array<[string, string, string, number]> =>
  (film(out, title).evidence[person] ?? []).map((e) => [
    e.text,
    e.strength,
    e.kind,
    e.contribution,
  ])

/** The warnings without TMDB's, which every request without a key gets. */
export const withoutPosterWarning = (
  warnings: ReadonlyArray<string>,
): string[] => warnings.filter((w) => !w.startsWith('TMDB '))
