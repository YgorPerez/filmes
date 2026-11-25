// `pnpm build`'s last step: the repo's `config/` (English keys, ADR 0002),
// as it is, into the build at `.output/config`, which the image carries and
// points `FILMES_CONFIG` at (`Dockerfile`).
//
// `local.toml` is a machine's own paths, outside git: it never goes in.
//
// Runs on plain `node`, which reads TypeScript by itself.

import { cpSync, readdirSync, rmSync } from 'node:fs'
import { basename, resolve } from 'node:path'

const LOCAL = 'local.toml'

/** The files of `source` (`config/`), copied into `destination`, which is
 * replaced. Returns the names written. */
export function bundleConfig(source: string, destination: string): string[] {
  rmSync(destination, { recursive: true, force: true })
  cpSync(source, destination, {
    recursive: true,
    filter: (path) => basename(path) !== LOCAL,
  })
  return readdirSync(destination).sort()
}

if (import.meta.main) {
  const here = import.meta.dirname
  const written = bundleConfig(
    resolve(here, '../../config'),
    resolve(here, '../.output/config'),
  )
  console.log(`[config] ${written.join(', ')} -> .output/config`)
}
