// The server log of an engine error the Dono cannot fix from the page.
// Server only.

import type { ErrorOutput } from '@filmes/engine'

/** Writes the engine's error to the server log (`docker logs`), so whoever
 * runs the server sees why. */
export function logEngineError(outcome: { output: ErrorOutput }): void {
  const { code, message } = outcome.output.error
  console.error(`engine: ${code}: ${message}`)
}
