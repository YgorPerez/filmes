// `pnpm catalog:update`: the engine's `update` (Python's `atualizar`) on
// servidor-azul. Downloads the IMDb, Wikidata and GroupLens dumps into the
// catalog (`FILMES_CATALOGO`, or the catalog path of the config's
// `local.toml`) and pins them in the config folder's manifest
// (`catalog-versions.json`), which then goes in a commit. From the
// repository root:
//
//   pnpm catalog:update [--config <config>]
//
// The engine reads the config folder (`--config`, the repo's `config/` by
// default) as it is and writes the manifest into it; `FILMES_VERSOES` set by
// the caller wins. Progress goes to stderr as one JSON line per step.
//
// Runs on plain `node`, which reads TypeScript by itself.

import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import {
  makeEngine,
  progressTo,
  update,
  type UpdateProgress,
} from '@filmes/engine'
import { REPO } from './db-build.ts'

const USAGE = 'Usage: pnpm catalog:update [--config <config>]'

/** Runs `update` with the config `argv` names; returns the exit code. */
export async function runUpdate({
  argv,
  env,
  progress,
  print,
  fetch,
}: {
  argv: readonly string[]
  env: Record<string, string | undefined>
  progress: (event: UpdateProgress) => void
  /** Where the outcome's JSON goes. */
  print: (text: string) => void
  /** The network; tests pass a fake. */
  fetch?: typeof globalThis.fetch
}): Promise<number> {
  let config: string
  try {
    const { values } = parseArgs({
      args: [...argv],
      options: { config: { type: 'string' } },
    })
    config = resolve(values.config ?? join(REPO, 'config'))
  } catch {
    print(USAGE)
    return 2
  }
  const engine = makeEngine({ ...env, FILMES_CONFIG: config })
  try {
    const outcome = await engine.run(
      update({ fetch, onProgress: progressTo(progress) }),
    )
    print(JSON.stringify(outcome.output))
    return outcome.exitCode
  } finally {
    await engine.dispose()
  }
}

if (import.meta.main)
  process.exitCode = await runUpdate({
    argv: process.argv.slice(2),
    env: process.env,
    progress: (event) => process.stderr.write(`${JSON.stringify(event)}\n`),
    print: (text) => process.stdout.write(`${text}\n`),
  })
