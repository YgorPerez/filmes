// The engine's test seam, the Vitest twin of the Python `tests/conftest.py`:
// each test gets its own copy of the fixture (filmes-dados in English, the
// config in English, the database Python built), and runs engine operations
// on it through `makeEngine`, the same edge the app and the MCP use.
//
//     test('...', async () => {
//       const fixture = useFixture()
//       const films = await fixture.ok(someOperation)
//       const outcome = await fixture.run(otherOperation, { FILMES_DADOS: undefined })
//     })

import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Effect } from 'effect'
import { onTestFinished } from 'vite-plus/test'
import {
  makeEngine,
  type EngineServices,
  type Outcome,
  type Run,
  type RunOptions,
  type Vars,
} from '../src/index.ts'
import { FIXTURE_ENV, FIXTURE_TODAY, ROOT } from './paths.ts'

export { FIXTURE_TODAY, ROOT }

export interface Fixture {
  /** The test's own folder, removed when the test ends. */
  readonly root: string
  /** filmes-dados (English keys), writable. */
  readonly data: string
  /** The derived database, writable. */
  readonly database: string
  /** The config folder (English TOML). */
  readonly config: string
  /** The variables of an engine over this copy. */
  readonly vars: Vars
  /** Runs `effect` on a fresh engine over this copy. `vars` add to or, with
   * `undefined`, remove from `fixture.vars`; `options.owner` is the
   * logged-in Pessoa, as the app and the MCP pass her. */
  readonly run: <A, E>(
    effect: Effect.Effect<A, E, EngineServices | Run>,
    vars?: Vars,
    options?: RunOptions,
  ) => Promise<Outcome<A>>
  /** `run`, and the value; a failure throws with the error output. */
  readonly ok: <A, E>(
    effect: Effect.Effect<A, E, EngineServices | Run>,
    vars?: Vars,
    options?: RunOptions,
  ) => Promise<A>
}

/** A copy of the built fixture for the current test. */
export function useFixture(): Fixture {
  const built = process.env[FIXTURE_ENV]
  if (!built)
    throw new Error(`${FIXTURE_ENV} is not set: is test/global-setup.ts on?`)
  const root = mkdtempSync(join(tmpdir(), 'filmes-engine-test-'))
  onTestFinished(() => rmSync(root, { recursive: true, force: true }))
  cpSync(built, root, { recursive: true })

  const data = join(root, 'data')
  const database = join(root, 'filmes.sqlite')
  const config = join(root, 'config')
  const vars: Vars = {
    FILMES_CONFIG: config,
    FILMES_DADOS: data,
    FILMES_CATALOGO: join(ROOT, 'tests/fixture/catalogo'),
    FILMES_BANCO: database,
    FILMES_HOJE: FIXTURE_TODAY,
    // A local.toml that does not exist: the machine's never reaches a test.
    FILMES_LOCAL: join(root, 'no-local.toml'),
  }

  const run: Fixture['run'] = async (effect, extra = {}, options) => {
    const engine = makeEngine({ ...vars, ...extra })
    try {
      return await engine.run(effect, options)
    } finally {
      await engine.dispose()
    }
  }
  const ok: Fixture['ok'] = async (effect, extra, options) => {
    const outcome = await run(effect, extra, options)
    if (outcome.exitCode !== 0)
      throw new Error(`expected success, got ${JSON.stringify(outcome)}`)
    return outcome.output
  }
  return { root, data, database, config, vars, run, ok }
}
