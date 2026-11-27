// The covers of a few films, for a screen that shows them small (the home's
// latest Sessão, #271): the TMDB poster at w185, from the card lookup the
// Cartaz makes, which answers from the cache. No key, no answer or a
// failure is a film with no cover, never an error: the screen shows the
// tape's spine instead.

import { Effect } from 'effect'
import type { Run } from '../runtime/Run.ts'
import { Tmdb } from '../sources/Tmdb.ts'

export interface CoversRequest {
  /** IMDb ids. */
  readonly films: ReadonlyArray<string>
}

/** Each film's poster URL, or null, by IMDb id. */
export const filmCovers = (
  request: CoversRequest,
): Effect.Effect<Record<string, string | null>, never, Tmdb | Run> =>
  Effect.gen(function* () {
    const tmdb = yield* Tmdb
    const pairs = yield* Effect.forEach(request.films, (id) =>
      tmdb.card(id).pipe(
        Effect.map((card) => [id, card.poster] as const),
        Effect.orElseSucceed(() => [id, null] as const),
      ),
    )
    return Object.fromEntries(pairs)
  })
