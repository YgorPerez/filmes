// The app's one engine (ADR 0003): built on first use from the server's
// environment and kept for the life of the process. Server only.
//
// The engine reads the `FILMES_*` variables (`FILMES_CONFIG` above all; the
// image sets it to the config the build bundles, `scripts/bundle-config.ts`).
// Two of them come from the app's own names, so the login and the engine
// never read different folders: filmes-dados is `DATA_REPO_PATH`, and the
// database is `FILMES_DATABASE`, the version `db:publish` put live.

import { makeEngine, reloadData, type Engine, type Vars } from '@filmes/engine'
import { serverEnv } from './server-env'
import { traktConnection } from './trakt'

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
  (engine ??= makeEngine(engineVars(process.env), {
    trakt: traktConnection(process.env),
  }))

/** Reloads filmes-dados into the live database (#104): the database
 * `db:publish` swapped in was built from an older filmes-dados than the one
 * the app has been writing to. Never rejects: a failure goes to the log and
 * the app serves what the database has (the pages that cannot work say the
 * engine is not ready). */
export async function reloadOnStart(
  engine: Engine,
  database: string | undefined,
  log: (line: string) => void,
): Promise<void> {
  if (database === undefined) {
    log('engine: no FILMES_DATABASE yet, nothing to reload')
    return
  }
  const started = performance.now()
  const outcome = await engine.run(reloadData)
  const ms = Math.round(performance.now() - started)
  if (outcome.exitCode === 0)
    log(
      `engine: reloaded ${outcome.output.people.length} Pessoas and ${outcome.output.sessions.length} Sessions in ${ms}ms`,
    )
  else
    log(
      `engine: reload: ${outcome.output.error.code}: ${outcome.output.error.message}`,
    )
}

let ready: Promise<void> | undefined

/** The start-up reload of the process's engine, started on the first call;
 * the server waits for it before each request. */
export const engineReady = (): Promise<void> =>
  (ready ??= reloadOnStart(
    appEngine(),
    serverEnv(process.env).FILMES_DATABASE,
    (line) => console.log(line),
  ))
