// `pnpm db:publish --build`: the derived SQLite, built on servidor-azul by
// the engine's `rebuild` (map #72). The build reads filmes-dados and the
// config where they are (`FILMES_DADOS`, `FILMES_CONFIG`), both in English
// keys (ADR 0002), and only reads them.
//
// The rest of the build's environment is the caller's: the dumps
// (`FILMES_CATALOGO`, or the catalog path of the config's `local.toml`),
// `FILMES_HOJE`...
//
// Runs on plain `node`, which reads TypeScript by itself.

import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'

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
 * folder `config`. Throws, with the engine's error, when the rebuild
 * fails. */
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
  const result = run(process.execPath, [REBUILD_SCRIPT], {
    cwd: REPO,
    env: {
      ...env,
      FILMES_DADOS: resolve(data),
      FILMES_CONFIG: resolve(config),
      FILMES_BANCO: database,
    },
  })
  if (result.status !== 0)
    throw new Error(
      `the engine could not build the database: ${engineError(result)}`,
    )
}

/** What `git -C cwd <args>` printed, trimmed, or null when it failed. */
function git(cwd: string, ...args: string[]): string | null {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : null
}

/** The commit the code is at: its image goes live with the database it
 * builds (#258). */
export function headOf(repo: string = REPO): string {
  const head = git(repo, 'rev-parse', 'HEAD')
  if (head === null) throw new Error(`${repo} is not a git checkout.`)
  return head
}

/** Refuses a filmes-dados checkout with changes or behind its remote: the
 * VPS writes to filmes-dados (ADR 0005), and a build from an old copy would
 * publish a database without what it wrote (#258). A folder that is not a
 * checkout of its own, such as a test's copy, is built as it is. */
export function checkDataCheckout(
  data: string,
  say: (line: string) => void,
): void {
  const top = git(data, 'rev-parse', '--show-toplevel')
  if (top === null || realpathSync(top) !== realpathSync(data)) {
    say(`${data} is not a git checkout of its own: built as it is`)
    return
  }
  if (git(data, 'fetch', '--quiet') === null)
    throw new Error(
      `git fetch failed in ${data}: it cannot tell whether the copy is behind.`,
    )
  if (git(data, 'status', '--porcelain'))
    throw new Error(
      `${data} has uncommitted changes: commit or discard them, then build.`,
    )
  const behind = git(data, 'rev-list', '--count', 'HEAD..@{upstream}')
  if (behind === null)
    throw new Error(`${data} has no upstream branch to compare with.`)
  if (Number(behind) > 0)
    throw new Error(
      `${data} is ${behind} commits behind its remote: git -C ${data} pull, then build.`,
    )
}
