// The edge: how the web app, the MCP and the CLI run the engine (ADR 0003).
// Each process builds one `Engine` from its environment variables and runs
// every request through `engine.run`, which gives the request a fresh `Run`
// and turns the result into the CLI contract: exit code 0 and the value, or
// exit code 1 (2 for `invalid_usage`) and `{"error": {"code", "message"}}`.
// Nothing above `packages/engine` writes Effect code to call it.

import { Cause, Effect, Exit, Layer, ManagedRuntime } from 'effect'
import { DataWriter } from '../data/DataWriter.ts'
import { DoesTheDogDie } from '../sources/DoesTheDogDie.ts'
import { Omdb } from '../sources/Omdb.ts'
import { Transport } from '../sources/Source.ts'
import { SourceCache } from '../sources/SourceCache.ts'
import { Tmdb } from '../sources/Tmdb.ts'
import { Sqlite } from '../sqlite/Sqlite.ts'
import { EngineError, type ErrorCode } from './EngineError.ts'
import { Environment, type Vars } from './Environment.ts'
import { Run } from './Run.ts'
import { Today } from './Today.ts'

/** What every engine operation may require. */
export type EngineServices =
  | Environment
  | Today
  | Sqlite
  | DataWriter
  | SourceCache
  | Omdb
  | DoesTheDogDie
  | Tmdb

/** The on-demand sources, sharing one cache connection and one transport
 * (the network, or `FILMES_GRAVACOES`). */
const sourcesLayer = Layer.mergeAll(
  Omdb.layer,
  DoesTheDogDie.layer,
  Tmdb.layer,
).pipe(Layer.provide(Transport.layer), Layer.provideMerge(SourceCache.layer))

/** The process-wide services, from the environment variables. The writer
 * shares the one `Sqlite` (and so its write lock). */
export const engineLayer = (
  vars: Vars,
): Layer.Layer<EngineServices, EngineError> =>
  Layer.mergeAll(
    Today.layer,
    DataWriter.layer.pipe(Layer.provideMerge(Sqlite.layer)),
    sourcesLayer,
  ).pipe(Layer.provideMerge(Environment.layerFrom(vars)))

export interface ErrorOutput {
  readonly error: { readonly code: ErrorCode; readonly message: string }
}

export type Outcome<A> =
  | { readonly exitCode: 0; readonly output: A }
  | { readonly exitCode: 1 | 2; readonly output: ErrorOutput }

/** A failure as the contract shows it. An `EngineError` keeps its code;
 * anything else (a `SqliteError`, a defect, an interruption) is `internal`
 * with the name and message, as Python's `f"{type(erro).__name__}: {erro}"`. */
export const errorOutcome = (cause: Cause.Cause<unknown>): Outcome<never> => {
  const error = Cause.squash(cause)
  if (error instanceof EngineError)
    return {
      exitCode: error.code === 'invalid_usage' ? 2 : 1,
      output: { error: { code: error.code, message: error.message } },
    }
  const message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : `Error: ${String(error)}`
  return { exitCode: 1, output: { error: { code: 'internal', message } } }
}

export interface Engine {
  /** Runs one request with its own `Run`. Never rejects: every failure is
   * an `Outcome` with an error. */
  readonly run: <A, E>(
    effect: Effect.Effect<A, E, EngineServices | Run>,
  ) => Promise<Outcome<A>>
  /** Closes the process-wide services. */
  readonly dispose: () => Promise<void>
}

/** The engine of a process. The services are built on the first `run`; when
 * the environment is broken (no `FILMES_CONFIG`, a bad `weights.toml`), every
 * `run` returns that error. */
export const makeEngine = (vars: Vars): Engine => {
  const runtime = ManagedRuntime.make(engineLayer(vars))
  return {
    run: async (effect) => {
      const exit = await runtime.runPromiseExit(
        effect.pipe(Effect.provide(Run.layer)),
      )
      return Exit.isSuccess(exit)
        ? { exitCode: 0, output: exit.value }
        : errorOutcome(exit.cause)
    },
    dispose: () => runtime.dispose(),
  }
}
