// `pnpm db:publish --build`: the derived SQLite, built on servidor-azul by
// the engine's `rebuild` (map #72). The engine reads English keys (ADR
// 0002) and the repo's `config/` is still in Portuguese: the key migration
// (#77) writes filmes-dados and the config into a scratch folder in English,
// and the build reads them from there (`FILMES_DADOS`, `FILMES_CONFIG`), so
// neither the checkout nor the repo's `config/` is touched. A folder already
// in English goes through unchanged.
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

/** The repository root, where the build runs. */
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

/** The engine's error, from its `{"error": {...}}` output when it gave
 * one. */
function engineError({ status, stdout, stderr }: Ran) {
  try {
    const { error } = JSON.parse(stdout) as {
      error?: { code: string; message: string }
    }
    if (error) return `${error.code}: ${error.message}`
  } catch {
    // Not JSON: the process never started, or crashed before printing.
  }
  return `exit ${status ?? 'signal'}\n${stdout}${stderr}`.trim()
}

/** The engine's `rebuild` as a process. */
const REBUILD_SCRIPT = join(import.meta.dirname, 'db-rebuild.ts')

/** Builds `database` from the filmes-dados checkout `data` and the config
 * folder `config`. Throws, with the engine's error, when the rebuild fails;
 * leaves no scratch folder behind. */
export function buildDatabase({
  data,
  config,
  database,
  env,
  run = spawnRunner,
}: {
  data: string
  config: string
  database: string
  env: Record<string, string | undefined>
  run?: Runner
}): void {
  const scratch = mkdtempSync(join(tmpdir(), 'filmes-db-build-'))
  try {
    const scratchData = join(scratch, 'data')
    const scratchConfig = join(scratch, 'config')
    migrateData(data, scratchData, 'to-en')
    migrateConfig(config, scratchConfig, 'to-en')
    const result = run(process.execPath, [REBUILD_SCRIPT], {
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
        `the engine could not build the database: ${engineError(result)}`,
      )
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}
