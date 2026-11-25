// Today's date, the engine's clock. `FILMES_HOJE` pins it (tests); otherwise it is the date in America/Sao_Paulo, from Effect's
// `Clock`, so a `TestClock` moves it. Python's `date.today()` was the host's
// local date, which is BRT on servidor-azul but UTC in a container (risk R9
// of #76): the zone is fixed here instead.
//
// Named `Today` and not `Clock` so it never shadows Effect's `Clock`.

import { Context, DateTime, Effect, Layer } from 'effect'
import { Environment } from './Environment.ts'

export const TIME_ZONE = 'America/Sao_Paulo'

export class Today extends Context.Service<
  Today,
  {
    /** Today as `YYYY-MM-DD`. Asked anew each time: a long-lived server
     * crosses midnight. Inside a request, use `Run.today`, fixed when the
     * request starts. */
    readonly date: Effect.Effect<string>
  }
>()('@filmes/engine/runtime/Today') {
  static readonly layer: Layer.Layer<Today, never, Environment> = Layer.effect(
    Today,
    Effect.gen(function* () {
      const { fixedToday } = yield* Environment
      const date =
        fixedToday === undefined
          ? Effect.map(DateTime.now, (now) =>
              DateTime.formatIsoDate(
                DateTime.setZoneNamedUnsafe(now, TIME_ZONE),
              ),
            )
          : Effect.succeed(fixedToday)
      return Today.of({ date })
    }),
  )
}
