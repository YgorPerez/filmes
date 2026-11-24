import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Effect, Schema } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import { Environment, type PathName } from '../src/index.ts'
import { useFixture, type Fixture } from './fixture.ts'

const environment = Effect.gen(function* () {
  const env = yield* Environment
  return env
})

const path = (name: PathName) =>
  Effect.gen(function* () {
    const env = yield* Environment
    return yield* env.path(name)
  })

const errorOf = async <A, E>(
  fixture: Fixture,
  effect: Effect.Effect<A, E, Environment>,
  vars?: Record<string, string | undefined>,
) => {
  const outcome = await fixture.run(effect, vars)
  if (outcome.exitCode === 0) throw new Error('expected an error')
  return outcome.output.error
}

/** The fixture's weights.toml with one line changed. */
const weightsWith = (fixture: Fixture, from: string, to: string): string => {
  const text = readFileSync(join(fixture.config, 'weights.toml'), 'utf8')
  expect(text).toContain(from)
  const file = join(fixture.root, 'other-weights.toml')
  writeFileSync(file, text.replace(from, to))
  return file
}

describe('weights', () => {
  test('come from the English weights.toml', async () => {
    const fixture = useFixture()

    const { weights } = await fixture.ok(environment)

    expect(weights.utility).toEqual({ k: 1, max_evidence: 5 })
    expect(weights.catalog).toEqual({ min_votes: 1000, min_imdb_rating: 7 })
    expect(weights.similar.weight.genome).toBe(0.35)
  })

  test('keep the order of the file in tables keyed by data', async () => {
    const fixture = useFixture()

    const { weights } = await fixture.ok(environment)

    expect(Object.keys(weights.path.weight)).toEqual([
      'director',
      'writer',
      'series',
      'cast',
      'genre',
    ])
  })

  test('FILMES_PESOS points to another file', async () => {
    const fixture = useFixture()
    const file = weightsWith(
      fixture,
      '\nmax_evidence = 5\n',
      '\nmax_evidence = 2\n',
    )

    const { weights } = await fixture.ok(environment, { FILMES_PESOS: file })

    expect(weights.utility.max_evidence).toBe(2)
  })

  test('a missing file is missing_config, naming it', async () => {
    const fixture = useFixture()
    const file = join(fixture.root, 'nothing.toml')

    const error = await errorOf(fixture, environment, { FILMES_PESOS: file })

    expect(error).toEqual({
      code: 'missing_config',
      message: `arquivo de config não encontrado: ${file}`,
    })
  })

  test('a file that is not TOML is invalid_config', async () => {
    const fixture = useFixture()
    const file = weightsWith(fixture, '[utility]', '[utility')

    const error = await errorOf(fixture, environment, { FILMES_PESOS: file })

    expect(error.code).toBe('invalid_config')
    expect(error.message.startsWith(`${file}: `)).toBe(true)
  })

  test('a value of the wrong type is invalid_config', async () => {
    const fixture = useFixture()
    const file = weightsWith(fixture, 'max_evidence = 5', 'max_evidence = 2.5')

    const error = await errorOf(fixture, environment, { FILMES_PESOS: file })

    expect(error.code).toBe('invalid_config')
    expect(error.message).toContain(file)
  })
})

describe('config', () => {
  test('without FILMES_CONFIG nothing runs', async () => {
    const fixture = useFixture()

    const error = await errorOf(fixture, environment, {
      FILMES_CONFIG: undefined,
    })

    expect(error.code).toBe('missing_config')
    expect(error.message).toContain('FILMES_CONFIG')
  })

  test('the other config files are read and decoded on demand', async () => {
    const fixture = useFixture()
    const TagGroups = Schema.Record(
      Schema.String,
      Schema.Struct({ label: Schema.String }),
    )

    const groups = await fixture.ok(
      Effect.gen(function* () {
        const env = yield* Environment
        return yield* env.readConfig('tag_vetoes', TagGroups)
      }),
    )

    expect(groups.slow).toEqual({ label: 'lento' })
  })

  test('a config file that does not fit its schema is invalid_config', async () => {
    const fixture = useFixture()

    const error = await errorOf(
      fixture,
      Effect.gen(function* () {
        const env = yield* Environment
        return yield* env.readConfig(
          'moods',
          Schema.Record(Schema.String, Schema.Finite),
        )
      }),
    )

    expect(error.code).toBe('invalid_config')
    expect(error.message).toContain('moods.toml')
  })
})

describe('paths', () => {
  test('come from the variables', async () => {
    const fixture = useFixture()

    expect(await fixture.ok(path('data'))).toBe(fixture.data)
    expect(await fixture.ok(path('database'))).toBe(fixture.database)
  })

  test('an empty variable counts as unset', async () => {
    const fixture = useFixture()

    const error = await errorOf(fixture, path('data'), { FILMES_DADOS: '' })

    expect(error).toEqual({
      code: 'missing_config',
      message:
        "caminho 'data' não configurado: defina FILMES_DADOS ou [paths] data em config/local.toml",
    })
  })

  test('local.toml fills what the variables leave out, and a variable wins', async () => {
    const fixture = useFixture()
    const local = join(fixture.root, 'local.toml')
    writeFileSync(
      local,
      '[paths]\ndata = "/from/local/data"\nrecordings = "/from/local/recordings"\n',
    )

    const paths = await fixture.ok(
      Effect.map(environment, (env) => env.paths),
      { FILMES_LOCAL: local, FILMES_DADOS: undefined },
    )
    const overridden = await fixture.ok(path('recordings'), {
      FILMES_LOCAL: local,
      FILMES_GRAVACOES: '/from/variable',
    })

    expect(paths.data).toBe('/from/local/data')
    expect(paths.recordings).toBe('/from/local/recordings')
    expect(overridden).toBe('/from/variable')
  })

  test('the cache sits beside the database unless set', async () => {
    const fixture = useFixture()

    const beside = await fixture.ok(path('cache'))
    const set = await fixture.ok(path('cache'), { FILMES_CACHE: '/a/cache' })

    expect(beside).toBe(join(fixture.root, 'filmes-cache.sqlite'))
    expect(set).toBe('/a/cache')
  })

  test('the catalog and the database default to the user data folder', async () => {
    const fixture = useFixture()

    const paths = await fixture.ok(
      Effect.map(environment, (env) => env.paths),
      {
        FILMES_CATALOGO: undefined,
        FILMES_BANCO: undefined,
        XDG_DATA_HOME: '/xdg',
      },
    )

    expect(paths.catalog).toBe('/xdg/filmes/catalogo')
    expect(paths.database).toBe('/xdg/filmes/filmes.sqlite')
    expect(paths.versions).toBe(join(fixture.config, 'catalog-versions.json'))
  })
})
