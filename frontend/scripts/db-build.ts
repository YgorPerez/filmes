// `pnpm db:publish --build`: the derived SQLite, built on servidor-azul by
// the engine's `rebuild` (map #72), or, with `--python`, by the Python
// engine until it leaves (#108). The app writes filmes-dados with English
// keys and the image carries the config in English (ADR 0002), while Python
// reads only Portuguese: the key migration (#77) writes both into a scratch
// folder, in English for the engine and in Portuguese for Python, and the
// build reads them from there (`FILMES_DADOS`, `FILMES_CONFIG`), so neither
// the checkout nor the repo's `config/` is touched. A folder already in the
// target language goes through unchanged.
//
// The rest of the build's environment is the caller's: the dumps
// (`FILMES_CATALOGO`, or the catalog path of the config's `local.toml`,
// which the scratch config keeps), `FILMES_HOJE`...
//
// Runs on plain `node`, which reads TypeScript by itself.

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { migrateConfig, migrateData } from '@filmes/key-migration'

/** The repository root, where `uv` finds the Python engine. */
export const REPO = resolve(import.meta.dirname, '../..')

/** What a process gave back. */
export interface Ran {
  readonly status: number | null
  readonly stdout: string
  readonly stderr: string
}

/** Runs a command in `cwd` with exactly `env`. */
export type Runner = (
  command: string,
  args: readonly string[],
  options: { cwd: string; env: Record<string, string | undefined> },
) => Ran

export const spawnRunner: Runner = (command, args, { cwd, env }) => {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? result.error?.message ?? '',
  }
}

/** Which engine builds: the TypeScript one, or Python until #108. */
export type Builder = 'typescript' | 'python'

/** The engine's error, from its `{"error": {...}}` (or Python's
 * `{"erro": {...}}`) output when it gave one. */
function engineError({ status, stdout, stderr }: Ran) {
  try {
    const { error, erro } = JSON.parse(stdout) as {
      error?: { code: string; message: string }
      erro?: { codigo: string; mensagem: string }
    }
    if (error) return `${error.code}: ${error.message}`
    if (erro) return `${erro.codigo}: ${erro.mensagem}`
  } catch {
    // Not JSON: the process never started, or crashed before printing.
  }
  return `exit ${status ?? 'signal'}\n${stdout}${stderr}`.trim()
}

/** The engine's `rebuild` as a process. */
export const REBUILD_SCRIPT = join(import.meta.dirname, 'db-rebuild.ts')

/** How each builder runs, and the language of what it reads. */
const BUILDERS: Readonly<
  Record<
    Builder,
    {
      readonly name: string
      readonly language: 'to-en' | 'to-pt'
      readonly command: string
      readonly args: readonly string[]
    }
  >
> = {
  typescript: {
    name: 'the engine',
    language: 'to-en',
    command: process.execPath,
    args: [REBUILD_SCRIPT],
  },
  python: {
    name: 'the Python engine',
    language: 'to-pt',
    command: 'uv',
    args: ['run', 'python', '-m', 'filmes', 'reconstruir', '--json'],
  },
}

/** Builds `database` from the filmes-dados checkout `data` and the config
 * folder `config`, either in English or in Portuguese. Throws, with the
 * engine's error, when the rebuild fails; leaves no scratch folder
 * behind. */
export function buildDatabase({
  data,
  config,
  database,
  env,
  builder = 'typescript',
  run = spawnRunner,
}: {
  data: string
  config: string
  database: string
  env: Record<string, string | undefined>
  builder?: Builder
  run?: Runner
}): void {
  const { name, language, command, args } = BUILDERS[builder]
  const scratch = mkdtempSync(join(tmpdir(), 'filmes-db-build-'))
  try {
    const scratchData = join(scratch, 'data')
    const scratchConfig = join(scratch, 'config')
    migrateData(data, scratchData, language)
    migrateConfig(config, scratchConfig, language)
    const result = run(command, args, {
      cwd: REPO,
      env: {
        ...env,
        FILMES_DADOS: scratchData,
        FILMES_CONFIG: scratchConfig,
        FILMES_BANCO: database,
      },
    })
    if (result.status !== 0)
      throw new Error(
        `${name} could not build the database: ${engineError(result)}`,
      )
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}
