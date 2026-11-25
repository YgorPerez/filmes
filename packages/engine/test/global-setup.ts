// Vitest global setup: the fixture every engine test starts from, built once.
//
// - the fixture's filmes-dados and the repo's `config/`, migrated to English
//   keys by the key migration (ADR 0002): the TypeScript engine reads only
//   those;
// - the derived database, built from them by the engine's own `rebuild`
//   over `tests/fixture/catalogo` (#105).
//
// The result is cached in `node_modules/.cache/filmes-engine-fixture/<hash>`,
// where the hash covers everything that could change it: the fixture, the
// engine, the config and the key migration. A run with nothing changed only
// hashes. Tests copy it per test (`fixture.ts`) and never write here.

import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { join, relative } from 'node:path'
import { migrateConfig, migrateData } from '@filmes/key-migration'
import { makeEngine, rebuild } from '../src/index.ts'
import { FIXTURE_ENV, FIXTURE_TODAY, ROOT } from './paths.ts'

/** What the fixture is built from, relative to the repo root. */
const INPUTS = [
  'tests/fixture/catalogo',
  'tests/fixture/dados',
  'tests/fixture/gravacoes',
  'packages/engine/src',
  'config',
  'packages/key-migration/src',
]

/** Not inputs: bytecode, and `config/local.toml`, which is outside
 * git, holds a machine's real paths and must never reach a test. */
const SKIPPED = new Set(['__pycache__', 'local.toml'])

const CACHE = join(ROOT, 'node_modules', '.cache', 'filmes-engine-fixture')

/** Every file under `path` (or `path` itself), in a stable order. */
function files(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path]
  return readdirSync(path, { withFileTypes: true })
    .filter((entry) => !SKIPPED.has(entry.name))
    .map((entry) => entry.name)
    .sort()
    .flatMap((name) => files(join(path, name)))
}

function inputsHash(): string {
  const hash = createHash('sha256')
  for (const input of INPUTS)
    for (const file of files(join(ROOT, input))) {
      hash.update(relative(ROOT, file))
      hash.update('\0')
      hash.update(readFileSync(file))
      hash.update('\0')
    }
  return hash.digest('hex').slice(0, 16)
}

/** The engine's `rebuild` over the fixture, into `database`, from the
 * migrated filmes-dados and config already in `work`. */
async function buildDatabase(work: string, database: string): Promise<void> {
  const engine = makeEngine({
    FILMES_CONFIG: join(work, 'config'),
    FILMES_DADOS: join(work, 'data'),
    FILMES_CATALOGO: join(ROOT, 'tests/fixture/catalogo'),
    FILMES_BANCO: database,
    FILMES_HOJE: FIXTURE_TODAY,
    FILMES_LOCAL: join(work, 'no-local.toml'),
    FILMES_GRAVACOES: join(ROOT, 'tests/fixture/gravacoes'),
  })
  try {
    const outcome = await engine.run(rebuild)
    if (outcome.exitCode !== 0)
      throw new Error(
        `the engine could not build the fixture database: ${JSON.stringify(outcome.output)}`,
      )
  } finally {
    await engine.dispose()
  }
}

async function build(target: string): Promise<void> {
  mkdirSync(CACHE, { recursive: true })
  const work = mkdtempSync(join(CACHE, '.build-'))
  try {
    migrateData(join(ROOT, 'tests/fixture/dados'), join(work, 'data'), 'to-en')
    migrateConfig(join(ROOT, 'config'), join(work, 'config'), 'to-en')
    rmSync(join(work, 'config', 'local.toml'), { force: true })
    await buildDatabase(work, join(work, 'filmes.sqlite'))
    renameSync(work, target)
  } catch (error) {
    rmSync(work, { recursive: true, force: true })
    // Another run built the same fixture first.
    if (!existsSync(target)) throw error
  }
}

export default async function setup(): Promise<void> {
  const target = join(CACHE, inputsHash())
  if (!existsSync(target)) await build(target)
  // Fixtures of older inputs.
  for (const entry of readdirSync(CACHE))
    if (!entry.startsWith('.') && join(CACHE, entry) !== target)
      rmSync(join(CACHE, entry), { recursive: true, force: true })
  // The workers start after this and inherit it.
  process.env[FIXTURE_ENV] = target
}
