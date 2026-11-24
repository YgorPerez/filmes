// One request's state: what a Python process had for free by living for one
// command. A long-lived server shares its layers between requests, so what
// must not leak from one request to the next lives here, built fresh by
// `Engine.run` for each one:
//
// - today, fixed when the request starts (a request never sees two dates);
// - the warnings (`avisos`) the request returns, in the order given;
// - the on-demand sources switched off for the rest of the request after a
//   failure (Python's "desligada até o fim da execução").

import { Context, Effect, Layer, Ref } from 'effect'
import { Today } from './Today.ts'

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
  }
>()('@filmes/engine/runtime/Run') {
  static readonly layer: Layer.Layer<Run, never, Today> = Layer.effect(
    Run,
    Effect.gen(function* () {
      const today = yield* (yield* Today).date
      const warnings = yield* Ref.make<ReadonlyArray<string>>([])
      const disabled = yield* Ref.make<ReadonlySet<string>>(new Set())
      return Run.of({
        today,
        warn: (text) => Ref.update(warnings, (list) => [...list, text]),
        warnings: Ref.get(warnings),
        disableSource: (source) =>
          Ref.update(disabled, (set) => new Set([...set, source])),
        isSourceDisabled: (source) =>
          Effect.map(Ref.get(disabled), (set) => set.has(source)),
      })
    }),
  )
}
