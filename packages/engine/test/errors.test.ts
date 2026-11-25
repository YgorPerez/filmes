// `tests/test_erros.py`, ported. The Python tests go through argv; here the
// same contract goes through the edge (`makeEngine`), and the argv part
// (an unknown command is `invalid_usage`) belongs to the oracle's argv
// adapter (#83).

import { join } from 'node:path'
import { output } from '@filmes/key-migration'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  ERROR_CODES,
  Environment,
  Sqlite,
  SqliteError,
  engineError,
} from '../src/index.ts'
import { useFixture } from './fixture.ts'

const readDatabase = Effect.gen(function* () {
  const sqlite = yield* Sqlite
  return yield* sqlite.read((db) => db.all('SELECT 1'))
})

describe('the error contract', () => {
  test('an error comes out with a non-zero exit code and only {error: {code, message}}; invalid usage exits 2', async () => {
    const fixture = useFixture()

    const outcome = await fixture.run(
      Effect.fail(engineError('invalid_usage', 'comando desconhecido')),
    )

    expect(outcome).toEqual({
      exitCode: 2,
      output: {
        error: { code: 'invalid_usage', message: 'comando desconhecido' },
      },
    })
  })

  test('any other engine error exits 1', async () => {
    const fixture = useFixture()

    const outcome = await fixture.run(
      Effect.fail(engineError('unknown_person', 'Pessoa desconhecida: zé')),
    )

    expect(outcome.exitCode).toBe(1)
    expect(outcome.output).toEqual({
      error: { code: 'unknown_person', message: 'Pessoa desconhecida: zé' },
    })
  })

  test('what nobody foresaw still follows the contract, as internal', async () => {
    const fixture = useFixture()

    const defect = await fixture.run(Effect.die(new TypeError('boom')))
    const sqlite = await fixture.run(
      Effect.fail(
        new SqliteError({ message: 'no such table: x', cause: null }),
      ),
    )

    expect(defect).toEqual({
      exitCode: 1,
      output: { error: { code: 'internal', message: 'TypeError: boom' } },
    })
    expect(sqlite).toEqual({
      exitCode: 1,
      output: {
        error: {
          code: 'internal',
          message: 'SqliteError: no such table: x',
        },
      },
    })
  })

  test('without a database, the error asks for reconstruir', async () => {
    const fixture = useFixture()

    const outcome = await fixture.run(readDatabase, {
      FILMES_BANCO: join(fixture.root, 'nothing-here.sqlite'),
    })

    expect(outcome.exitCode).not.toBe(0)
    if (outcome.exitCode === 0) return
    expect(outcome.output.error.code).toBe('missing_database')
    expect(outcome.output.error.message).toContain('reconstruir')
  })

  test('without the data repo configured, the error says what is missing', async () => {
    const fixture = useFixture()

    const outcome = await fixture.run(
      Effect.gen(function* () {
        const environment = yield* Environment
        return yield* environment.path('data')
      }),
      { FILMES_DADOS: undefined },
    )

    expect(outcome.exitCode).not.toBe(0)
    if (outcome.exitCode === 0) return
    expect(outcome.output.error.code).toBe('missing_config')
    expect(outcome.output.error.message).toContain('FILMES_DADOS')
  })

  test('the codes are the English codes of the key migration', () => {
    expect([...ERROR_CODES].sort()).toEqual(
      [...new Set(Object.values(output.ERROR_CODES))].sort(),
    )
  })
})
