// The app's one engine (ADR 0003): built on first use from the server's
// environment and kept for the life of the process. Server only.
//
// The engine reads the `FILMES_*` variables (`FILMES_CONFIG` above all). Two
// of them come from the app's own names, so the login and the engine never
// read different folders: filmes-dados is `DATA_REPO_PATH`, and the database
// is `FILMES_DATABASE`, the version `db:publish` put live.

import { makeEngine, type Engine, type Vars } from '@filmes/engine'
import { serverEnv } from './server-env'

/** The engine's variables from the server's. */
export function engineVars(env: NodeJS.ProcessEnv): Vars {
  const server = serverEnv(env)
  return {
    ...env,
    FILMES_DADOS: server.DATA_REPO_PATH,
    FILMES_BANCO: server.FILMES_DATABASE,
  }
}

let engine: Engine | undefined

/** The process's engine. A broken environment (no `FILMES_CONFIG`) is not a
 * crash: every run answers with that error. */
export const appEngine = (): Engine =>
  (engine ??= makeEngine(engineVars(process.env)))
