// The seam works end to end: the database Python built from the fixture,
// read by the TypeScript engine, and the fixture's data in English.

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { expect, test } from 'vite-plus/test'
import { Sqlite } from '../src/index.ts'
import { useFixture } from './fixture.ts'

test('reads films from the fixture database', async () => {
  const fixture = useFixture()

  const { films, count } = await fixture.ok(
    Effect.gen(function* () {
      const sqlite = yield* Sqlite
      return yield* sqlite.read((db) =>
        Effect.all({
          films: db.all(
            'SELECT id, titulo, ano FROM filmes ORDER BY id LIMIT 3',
          ),
          count: db.get('SELECT count(*) AS n FROM filmes'),
        }),
      )
    }),
  )

  expect(films).toEqual([
    { id: 'tt9000101', titulo: 'O Farol de Areia', ano: 2012 },
    { id: 'tt9000102', titulo: 'Maré Baixa', ano: 2015 },
    { id: 'tt9000103', titulo: 'Cidade de Vidro', ano: 2018 },
  ])
  expect(count).toEqual({ n: 91 })
})

test('the fixture data and config are the English ones', () => {
  const fixture = useFixture()

  expect(existsSync(join(fixture.data, 'people'))).toBe(true)
  expect(existsSync(join(fixture.data, 'pessoas'))).toBe(false)
  expect(existsSync(join(fixture.config, 'weights.toml'))).toBe(true)
  expect(existsSync(join(fixture.config, 'local.toml'))).toBe(false)
})
