// One request's state: what a Python process had for free by living for one
// command. A long-lived server shares its layers between requests, so what
// must not leak from one request to the next lives here, built fresh by
// `Engine.run` for each one:
//
// - today, fixed when the request starts (a request never sees two dates);
// - the warnings (`avisos`) the request returns, in the order given;
// - the on-demand sources switched off for the rest of the request after a
//   failure (Python's "desligada até o fim da execução");
// - how many times each recorded failure (`<key>.falha.json`) has failed
//   in this request, which its `vezes` limits.

import { Context, Effect, Layer, Ref } from 'effect'
import { Today } from './Today.ts'

/**
 * Request-scoped by design: a process-wide service whose methods need the
 * request's state (the on-demand sources) asks for it from every caller.
 *
 * @effect-leakable-service
 */
export class Run extends Context.Service<
  Run,
  {
    /** Today as `YYYY-MM-DD`, the same for the whole request. */
    readonly today: string
    /** Adds a warning to the request's list. */
    readonly warn: (text: string) => Effect.Effect<void>
    /** The warnings so far, in order. */
    readonly warnings: Effect.Effect<ReadonlyArray<string>>
    /** Switches a source (`omdb`, `ddd`, `tmdb`...) off until the request
     * ends. */
    readonly disableSource: (source: string) => Effect.Effect<void>
    readonly isSourceDisabled: (source: string) => Effect.Effect<boolean>
    /** Counts one more failure of a recorded answer (`source`, `key`) and
     * gives how many there were before it. */
    readonly countRecordedFailure: (
      source: string,
      key: string,
    ) => Effect.Effect<number>
  }
>()('@filmes/engine/runtime/Run') {
  static readonly layer: Layer.Layer<Run, never, Today> = Layer.effect(
    Run,
    Effect.gen(function* () {
      const today = yield* (yield* Today).date
      const warnings = yield* Ref.make<ReadonlyArray<string>>([])
      const disabled = yield* Ref.make<ReadonlySet<string>>(new Set())
      const recordedFailures = yield* Ref.make<ReadonlyMap<string, number>>(
        new Map(),
      )
      return Run.of({
        today,
        warn: (text) => Ref.update(warnings, (list) => [...list, text]),
        warnings: Ref.get(warnings),
        disableSource: (source) =>
          Ref.update(disabled, (set) => new Set([...set, source])),
        isSourceDisabled: (source) =>
          Effect.map(Ref.get(disabled), (set) => set.has(source)),
        countRecordedFailure: (source, key) =>
          Ref.modify(recordedFailures, (counts) => {
            const id = `${source}\0${key}`
            const before = counts.get(id) ?? 0
            return [before, new Map([...counts, [id, before + 1]])]
          }),
      })
    }),
  )
}

/** Today as the request sees it (`YYYY-MM-DD`), for a screen that says
 * "hoje" or "ontem" without reading the clock itself. */
export const requestToday: Effect.Effect<string, never, Run> = Effect.gen(
  function* () {
    return (yield* Run).today
  },
)
