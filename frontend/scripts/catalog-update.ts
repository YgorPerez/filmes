// `pnpm catalog:update`: the engine's `update` (Python's `atualizar`) on
// servidor-azul. Downloads the IMDb, Wikidata and GroupLens dumps into the
// catalog (`FILMES_CATALOGO`, or the catalog path of the config's
// `local.toml`) and pins them in the config folder's manifest, which then
// goes in a commit. From the repository root:
//
//   pnpm catalog:update [--config <config>]
//
// The config folder (`--config`, the repo's `config/` by default) may be in
// Portuguese or in English: the engine reads an English copy in a scratch
// folder, and the new manifest goes back in the folder's own language
// (`versoes-catalogo.json` or `catalog-versions.json`). `FILMES_VERSOES`
// set by the caller wins, and gets the English manifest. Progress goes to
// stderr as one JSON line per step.
//
// Runs on plain `node`, which reads TypeScript by itself.

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import {
  makeEngine,
  progressTo,
  update,
  type UpdateProgress,
} from '@filmes/engine'
import { migrateConfig, migrateConfigFile } from '@filmes/key-migration'
import { REPO } from './db-build.ts'

const USAGE = 'Usage: pnpm catalog:update [--config <config>]'

const PORTUGUESE_MANIFEST = 'versoes-catalogo.json'
const ENGLISH_MANIFEST = 'catalog-versions.json'

/** JSON text with every object's keys sorted, two spaces and a newline at
 * the end, as Python's `versoes.gravar` wrote the manifest. */
const sortedJson = (text: string) => {
  const sorted = (value: unknown): unknown =>
    typeof value === 'object' && value !== null
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [
              key,
              sorted((value as Record<string, unknown>)[key]),
            ]),
        )
      : value
  return `${JSON.stringify(sorted(JSON.parse(text)), null, 2)}\n`
}

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
  const scratch = mkdtempSync(join(tmpdir(), 'filmes-catalog-update-'))
  try {
    const english = join(scratch, 'config')
    migrateConfig(config, english, 'to-en')
    const engine = makeEngine({ ...env, FILMES_CONFIG: english })
    let outcome
    try {
      outcome = await engine.run(
        update({
          fetch,
          onProgress: progressTo(progress),
        }),
      )
    } finally {
      await engine.dispose()
    }
    print(JSON.stringify(outcome.output))
    if (outcome.exitCode === 0 && !env.FILMES_VERSOES) {
      const pinned = readFileSync(join(english, ENGLISH_MANIFEST), 'utf8')
      if (existsSync(join(config, PORTUGUESE_MANIFEST)))
        writeFileSync(
          join(config, PORTUGUESE_MANIFEST),
          sortedJson(
            migrateConfigFile(ENGLISH_MANIFEST, pinned, 'to-pt')!.text,
          ),
        )
      else writeFileSync(join(config, ENGLISH_MANIFEST), pinned)
    }
    return outcome.exitCode
  } finally {
    rmSync(scratch, { recursive: true, force: true })
  }
}

if (import.meta.main)
  process.exitCode = await runUpdate({
    argv: process.argv.slice(2),
    env: process.env,
    progress: (event) => process.stderr.write(`${JSON.stringify(event)}\n`),
    print: (text) => process.stdout.write(`${text}\n`),
  })
