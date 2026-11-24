// Vitest global setup: the fixture every engine test starts from, built once.
//
// - the derived database, built by the Python engine
//   (`python -m filmes reconstruir` over `tests/fixture`), until the
//   TypeScript reconstruct exists (#76, "the test seam before reconstruct");
// - the fixture's filmes-dados and the repo's `config/`, migrated to English
//   keys by the key migration (ADR 0002): the TypeScript engine reads only
//   those.
//
// The result is cached in `node_modules/.cache/filmes-engine-fixture/<hash>`,
// where the hash covers everything that could change it: the fixture, the
// Python engine, the config and the key migration. A run with nothing changed
// only hashes. Tests copy it per test (`fixture.ts`) and never write here.

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
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
import { FIXTURE_ENV, FIXTURE_TODAY, ROOT } from './paths.ts'

/** What the fixture is built from, relative to the repo root. */
const INPUTS = [
  'tests/fixture/catalogo',
  'tests/fixture/dados',
  'filmes',
  'config',
  'packages/key-migration/src',
  'pyproject.toml',
  'uv.lock',
]

/** Not inputs: Python's bytecode, and `config/local.toml`, which is outside
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

/** `python -m filmes reconstruir` over the fixture, into `database`. */
function buildDatabase(work: string, database: string): void {
  const data = join(work, 'py-dados')
  cpSync(join(ROOT, 'tests/fixture/dados'), data, { recursive: true })
  const env: NodeJS.ProcessEnv = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('FILMES_')),
  )
  Object.assign(env, {
    FILMES_DADOS: data,
    FILMES_CATALOGO: join(ROOT, 'tests/fixture/catalogo'),
    FILMES_BANCO: database,
    FILMES_HOJE: FIXTURE_TODAY,
    FILMES_LOCAL: join(work, 'no-local.toml'),
    FILMES_GRAVACOES: join(ROOT, 'tests/fixture/gravacoes'),
  })
  const result = spawnSync(
    'uv',
    ['run', 'python', '-m', 'filmes', 'reconstruir', '--json'],
    { cwd: ROOT, env, encoding: 'utf8' },
  )
  if (result.status !== 0)
    throw new Error(
      `the Python engine could not build the fixture database (is uv installed?):\n${result.error?.message ?? ''}\n${result.stdout}\n${result.stderr}`,
    )
  rmSync(data, { recursive: true })
}

function build(target: string): void {
  mkdirSync(CACHE, { recursive: true })
  const work = mkdtempSync(join(CACHE, '.build-'))
  try {
    buildDatabase(work, join(work, 'filmes.sqlite'))
    migrateData(join(ROOT, 'tests/fixture/dados'), join(work, 'data'), 'to-en')
    migrateConfig(join(ROOT, 'config'), join(work, 'config'), 'to-en')
    rmSync(join(work, 'config', 'local.toml'), { force: true })
    renameSync(work, target)
  } catch (error) {
    rmSync(work, { recursive: true, force: true })
    // Another run built the same fixture first.
    if (!existsSync(target)) throw error
  }
}

export default function setup(): void {
  const target = join(CACHE, inputsHash())
  if (!existsSync(target)) build(target)
  // Fixtures of older inputs.
  for (const entry of readdirSync(CACHE))
    if (!entry.startsWith('.') && join(CACHE, entry) !== target)
      rmSync(join(CACHE, entry), { recursive: true, force: true })
  // The workers start after this and inherit it.
  process.env[FIXTURE_ENV] = target
}
