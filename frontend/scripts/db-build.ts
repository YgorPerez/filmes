// `pnpm db:publish --build`: the derived SQLite, built by the Python engine
// on servidor-azul until the TypeScript reconstruct exists (map #72, ADR
// 0004). The app writes filmes-dados with English keys and the image carries
// the config in English (ADR 0002), while Python reads only Portuguese: the
// key migration (#77) writes both, in Portuguese, into a scratch folder, and
// Python rebuilds from there (`FILMES_DADOS`, `FILMES_CONFIG`), so neither
// the checkout nor the repo's `config/` is touched. A folder already in
// Portuguese goes through unchanged.
//
// The rest of Python's environment is the caller's: the dumps
// (`FILMES_CATALOGO`, or `[caminhos] catalogo` of the config's `local.toml`,
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

/** Python's error, from its `{"erro": {...}}` output when it gave one. */
function pythonError({ status, stdout, stderr }: Ran) {
  try {
    const { erro } = JSON.parse(stdout) as {
      erro?: { codigo: string; mensagem: string }
    }
    if (erro) return `${erro.codigo}: ${erro.mensagem}`
  } catch {
    // Not JSON: Python never started, or crashed before printing.
  }
  return `exit ${status ?? 'signal'}\n${stdout}${stderr}`.trim()
}

/** Builds `database` from the filmes-dados checkout `data` and the config
 * folder `config`, either in English or in Portuguese. Throws, with Python's
 * error, when the rebuild fails; leaves no scratch folder behind. */
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
    const dados = join(scratch, 'dados')
    const pt = join(scratch, 'config')
    migrateData(data, dados, 'to-pt')
    migrateConfig(config, pt, 'to-pt')
    const result = run(
      'uv',
      ['run', 'python', '-m', 'filmes', 'reconstruir', '--json'],
      {
        cwd: REPO,
        env: {
          ...env,
          FILMES_DADOS: dados,
          FILMES_CONFIG: pt,
          FILMES_BANCO: database,
        },
      },
    )
    if (result.status !== 0)
      throw new Error(
        `the Python engine could not build the database: ${pythonError(result)}`,
      )
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}
