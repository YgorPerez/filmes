import { Effect } from 'effect'
import { EngineError } from '../runtime/EngineError.ts'

/** Runs a reader that throws the `EngineError` of a bad file (as Python
 * raised it) as an Effect that fails with it; anything else stays a defect. */
export const attempt = <A>(f: () => A): Effect.Effect<A, EngineError> =>
  Effect.suspend(() => {
    try {
      return Effect.succeed(f())
    } catch (error) {
      if (error instanceof EngineError) return Effect.fail(error)
      throw error
    }
  })
