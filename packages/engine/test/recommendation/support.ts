// What the recommendation tests share. The Python tests set up their data
// through the CLI (`pessoa vetar`, `feedback`...), and those commands are
// not ported yet: here the Python CLI does that setup over a Portuguese copy
// of the fixture's data and the test's own database, which the engine then
// reads. The same helper runs Python's `recomendar` for the parity tests.

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { migrateConfigFile, outputToEnglish } from '@filmes/key-migration'
import { expect } from 'vite-plus/test'
import {
  recommend,
  type Recommendation,
  type RecommendedFilm,
  type RecommendRequest,
  type Vars,
} from '../../src/index.ts'
import { FIXTURE_TODAY, ROOT, type Fixture } from '../fixture.ts'

/** `python -m filmes <args> --json` over the fixture's Portuguese data
 * (copied once per test) and the test's database. `vars` add to or, with
 * `undefined`, remove from its environment. */
export const python = (
  fixture: Fixture,
  args: ReadonlyArray<string>,
  vars: Vars = {},
): { readonly exitCode: number; readonly output: unknown } => {
  const data = join(fixture.root, 'py-dados')
  if (!existsSync(data))
    cpSync(join(ROOT, 'tests/fixture/dados'), data, { recursive: true })
  const env: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('FILMES_')),
  )
  Object.assign(env, {
    FILMES_DADOS: data,
    FILMES_CATALOGO: join(ROOT, 'tests/fixture/catalogo'),
    FILMES_BANCO: fixture.database,
    FILMES_HOJE: FIXTURE_TODAY,
    FILMES_LOCAL: join(fixture.root, 'no-local.toml'),
    ...vars,
  })
  const result = spawnSync(
    'uv',
    ['run', 'python', '-m', 'filmes', ...args, '--json'],
    { cwd: ROOT, env, encoding: 'utf8' },
  )
  try {
    return { exitCode: result.status ?? -1, output: JSON.parse(result.stdout) }
  } catch {
    throw new Error(`python gave no JSON:\n${result.stdout}\n${result.stderr}`)
  }
}

/** `python`, requiring success. */
export const pythonOk = (
  fixture: Fixture,
  args: ReadonlyArray<string>,
  vars: Vars = {},
): unknown => {
  const { exitCode, output } = python(fixture, args, vars)
  if (exitCode !== 0)
    throw new Error(`python ${args.join(' ')}: ${JSON.stringify(output)}`)
  return output
}

/** Python's `recomendar` in English keys, without the Session it opens. */
export const pythonRecommendation = (
  fixture: Fixture,
  args: ReadonlyArray<string>,
  vars: Vars = {},
): unknown => {
  const output = outputToEnglish(
    'recomendar',
    pythonOk(fixture, ['recomendar', ...args], vars),
  ) as Record<string, unknown>
  delete output['session']
  return output
}

/** The engine's recommendation, as JSON (what an edge prints). */
export const engineRecommendation = async (
  fixture: Fixture,
  request: RecommendRequest,
  vars: Vars = {},
): Promise<Recommendation> =>
  JSON.parse(
    JSON.stringify(await fixture.ok(recommend(request), vars)),
  ) as Recommendation

/** Both engines on the same request: Python's argv and the engine's
 * request say the same thing. */
export const expectParity = async (
  fixture: Fixture,
  args: ReadonlyArray<string>,
  request: RecommendRequest,
  vars: { readonly python?: Vars; readonly engine?: Vars } = {},
): Promise<Recommendation> => {
  const expected = pythonRecommendation(fixture, args, vars.python)
  const actual = await engineRecommendation(fixture, request, vars.engine)
  expect(actual).toEqual(expected)
  return actual
}

/** A copy of `config/pesos.toml` with `from` replaced by `to`, for Python,
 * and its English migration, for the engine: the `FILMES_PESOS` of each. */
export const weightsWith = (
  fixture: Fixture,
  from: string,
  to: string,
): { readonly python: Vars; readonly engine: Vars } => {
  const text = readFileSync(join(ROOT, 'config/pesos.toml'), 'utf8')
  if (!text.includes(from)) throw new Error(`pesos.toml has no ${from}`)
  const changed = text.replace(from, to)
  const english = migrateConfigFile('pesos.toml', changed, 'to-en')
  if (!english) throw new Error('pesos.toml did not migrate')
  const pt = join(fixture.root, 'pesos-test.toml')
  const en = join(fixture.root, 'weights-test.toml')
  writeFileSync(pt, changed)
  writeFileSync(en, english.text)
  return { python: { FILMES_PESOS: pt }, engine: { FILMES_PESOS: en } }
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
