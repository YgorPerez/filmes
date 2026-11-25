// The cache is one file both engines read and write: the oracle hands the
// TypeScript engine a copy of the cache the Python filled, and until cutover
// the Python CLI on servidor-azul and the app may share one. Python writes
// it here through its CLI, as the Python tests do.

import { spawnSync } from 'node:child_process'
import { cpSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { expect, test } from 'vite-plus/test'
import { Omdb, SourceCache } from '../../src/index.ts'
import { FIXTURE_TODAY, ROOT, useFixture, type Fixture } from '../fixture.ts'
import { cacheRows, OFFLINE, RECORDED, withWarnings } from './support.ts'

/** `python -m filmes recomendar` over a Portuguese copy of the fixture's
 * data and the test's database; its JSON output. */
const pythonRecommend = (
  fixture: Fixture,
  cache: string,
  vars: Readonly<Record<string, string | undefined>>,
  ...args: string[]
) => {
  const data = join(fixture.root, 'py-dados')
  cpSync(join(ROOT, 'tests/fixture/dados'), data, { recursive: true })
  const env: Record<string, string | undefined> = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('FILMES_')),
  )
  Object.assign(env, {
    FILMES_DADOS: data,
    FILMES_CATALOGO: join(ROOT, 'tests/fixture/catalogo'),
    FILMES_BANCO: fixture.database,
    FILMES_CACHE: cache,
    FILMES_HOJE: FIXTURE_TODAY,
    FILMES_LOCAL: join(fixture.root, 'no-local.toml'),
    ...vars,
  })
  const result = spawnSync(
    'uv',
    [
      'run',
      'python',
      '-m',
      'filmes',
      'recomendar',
      '--presentes',
      'dono',
      '--quantos',
      '100',
      ...args,
      '--json',
    ],
    { cwd: ROOT, env, encoding: 'utf8' },
  )
  if (result.status !== 0)
    throw new Error(`python failed:\n${result.stdout}\n${result.stderr}`)
  return JSON.parse(result.stdout) as {
    filmes: Array<{ titulo: string }>
  }
}

test('a cache the Python filled is read as it is', async () => {
  const fixture = useFixture()
  const cache = join(fixture.root, 'shared-cache.sqlite')
  pythonRecommend(
    fixture,
    cache,
    RECORDED,
    '--crianca',
    '10',
    '--gatilho',
    'a dog dies',
  )
  const rows = cacheRows(cache)

  const read = await fixture.ok(
    Effect.gen(function* () {
      const sourceCache = yield* SourceCache
      const answers = yield* Effect.forEach(rows, (row) =>
        sourceCache.read(
          String(row['fonte']),
          String(row['chave']),
          FIXTURE_TODAY,
        ),
      )
      const rating = yield* withWarnings(
        Effect.flatMap(Effect.service(Omdb), (omdb) =>
          omdb.ageRating('tt9000302'),
        ),
      )
      return { answers, rating }
    }),
    { ...OFFLINE, FILMES_CACHE: cache },
  )

  // Every source answered something for Python to cache.
  expect(new Set(rows.map((row) => row['fonte']))).toEqual(
    new Set(['omdb', 'ddd', 'tmdb']),
  )
  expect(read.answers).toEqual(
    rows.map((row) => ({ body: row['corpo'], fetchedOn: row['obtido_em'] })),
  )
  expect(read.rating).toEqual({
    value: { rated: 'PG', date: FIXTURE_TODAY, factId: 'omdb:tt9000302' },
    warnings: [],
  })
})

test('a cache this engine filled is read by the Python', async () => {
  const fixture = useFixture()
  const cache = join(fixture.root, 'shared-cache.sqlite')
  await fixture.ok(
    Effect.flatMap(Effect.service(Omdb), (omdb) => omdb.ageRating('tt9000302')),
    { ...RECORDED, FILMES_CACHE: cache },
  )

  const output = pythonRecommend(
    fixture,
    cache,
    { FILMES_GRAVACOES: join(fixture.root, 'no-recordings') },
    '--crianca',
    '10',
  )

  // Vento Norte has no local age rating, and the Python has no OMDb key:
  // only the cached answer keeps it.
  expect(output.filmes.map((film) => film.titulo)).toContain('Vento Norte')
})
