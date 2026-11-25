// `pnpm build`'s last step: the engine's config, with English keys (ADR
// 0002), into the build at `.output/config`, which the image carries and
// points `FILMES_CONFIG` at (`Dockerfile`). Before the cutover the repo's
// `config/` is Portuguese and the key migration rewrites it; after it, the
// files are already English and go as they are.
//
// `local.toml` is a machine's own paths, outside git: it never goes in.
//
// Runs on plain `node`, which reads TypeScript by itself.

import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { migrateConfig } from '@filmes/key-migration'

const LOCAL = 'local.toml'

/** The files of `source` (`config/`), migrated to English into
 * `destination`, which is replaced. Returns the names written. */
export function bundleConfig(source: string, destination: string): string[] {
  const work = mkdtempSync(join(tmpdir(), 'filmes-config-'))
  try {
    const copy = join(work, 'config')
    cpSync(source, copy, {
      recursive: true,
      filter: (path) => basename(path) !== LOCAL,
    })
    rmSync(destination, { recursive: true, force: true })
    return migrateConfig(copy, destination, 'to-en').map((file) => file.to)
  } finally {
    rmSync(work, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  const here = import.meta.dirname
  const written = bundleConfig(
    resolve(here, '../../config'),
    resolve(here, '../.output/config'),
  )
  console.log(`[config] ${written.join(', ')} -> .output/config`)
}
