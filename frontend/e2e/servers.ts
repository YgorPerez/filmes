// One app server per e2e file, each over a copy of the engine's fixture of
// its own: what one file writes (a Feedback, a Já vi, an import) never
// changes what another file reads, however many workers run at once. The
// two projects of a file share its server. `playwright.config.ts` makes the
// copies and starts the servers; `support.ts` sends each test to its file's.

import { readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

/** The e2e files, in a stable order: each one's place gives its port. */
export const E2E_FILES = readdirSync(import.meta.dirname)
  .filter((name) => name.endsWith('.e2e.ts'))
  .sort()

/** The first port; the stand-in Google takes the next one by default, and
 * the files' servers the ones after it. */
export const BASE_PORT = Number(process.env.E2E_PORT ?? 4512)

/** Where one e2e file's server listens and what it reads and writes. */
export interface E2EServer {
  readonly port: number
  readonly origin: string
  /** The engine's fixture copy: `config/`, `data/` and the database. */
  readonly engine: string
  readonly authDatabase: string
}

/** The server of the e2e file at `path`, under `E2E_SERVERS`, the folder of
 * this run's copies. */
export function serverOf(path: string): E2EServer {
  const name = basename(path)
  const index = E2E_FILES.indexOf(name)
  const root = process.env.E2E_SERVERS
  if (index < 0 || !root) throw new Error(`no e2e server for ${path}`)
  const folder = join(root, name.replace(/\.e2e\.ts$/u, ''))
  const port = BASE_PORT + 2 + index
  return {
    port,
    origin: `http://localhost:${port}`,
    engine: join(folder, 'engine'),
    authDatabase: join(folder, 'auth.sqlite'),
  }
}
