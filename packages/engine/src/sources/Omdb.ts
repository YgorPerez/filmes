// OMDb: the `Rated` field, for the child Restrição when no local source has
// an age rating (`filmes/sob_demanda/omdb.py`). Cached for 30 days; the key
// is FILMES_OMDB_CHAVE.
//
// OMDb's terms forbid building an index: only a film that would reach a
// Session's top 50 is looked up.

import { Context, Effect, Layer } from 'effect'
import { casefold, pyStrip } from '../compat/index.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import type { Run } from '../runtime/Run.ts'
import type { SqliteError } from '../sqlite/Sqlite.ts'
import { field, text } from './json.ts'
import {
  getJson,
  makeObtain,
  SourceFailure,
  type SourceProfile,
  type Transport,
} from './Source.ts'
import type { SourceCache } from './SourceCache.ts'

export const OMDB_NAME = 'OMDb'
const URL = 'https://www.omdbapi.com/'

const PROFILE: SourceProfile = {
  name: OMDB_NAME,
  folder: 'omdb',
  id: 'omdb',
  keyVariable: 'FILMES_OMDB_CHAVE',
  validityDays: 30,
  withoutIt: 'filmes sem classificação local saem da Sessão com criança',
  notFound: { Response: 'False', Error: 'Movie not found!' },
}

/** A film's age rating as OMDb gives it. */
export interface AgeRating {
  /** As it came: "PG-13", "Not Rated". */
  readonly rated: string
  /** The day it was fetched. */
  readonly date: string
  readonly factId: string
}

export class Omdb extends Context.Service<
  Omdb,
  {
    /** The film's `Rated`, or `undefined` with no answer or no value. */
    readonly ageRating: (
      imdbId: string,
    ) => Effect.Effect<AgeRating | undefined, EngineError | SqliteError, Run>
  }
>()('@filmes/engine/sources/Omdb') {
  static readonly layer: Layer.Layer<
    Omdb,
    never,
    Environment | SourceCache | Transport
  > = Layer.effect(
    Omdb,
    Effect.gen(function* () {
      const obtain = yield* makeObtain

      const live = (imdbId: string) => (apiKey: string) =>
        Effect.flatMap(
          getJson(
            `${URL}?${new URLSearchParams({ i: imdbId, apikey: apiKey })}`,
          ),
          (body) => {
            if (body === null) return Effect.succeed(PROFILE.notFound)
            const error = text(field(body, 'Error'))
            const folded = casefold(error)
            // "Invalid API key!", "No API key provided.", "Request limit
            // reached!": true for every film, so the source goes off.
            if (
              field(body, 'Response') === 'False' &&
              (folded.includes('api key') || folded.includes('limit'))
            )
              return Effect.fail(
                new SourceFailure({ reason: error, transient: false }),
              )
            // "Movie not found!", "Incorrect IMDb ID.": only this film is
            // left without information.
            return Effect.succeed(body)
          },
        )

      return Omdb.of({
        ageRating: (imdbId) =>
          Effect.map(obtain(PROFILE, imdbId, live(imdbId)), (answer) => {
            if (
              answer === undefined ||
              field(answer.body, 'Response') !== 'True'
            )
              return undefined
            const rated = pyStrip(text(field(answer.body, 'Rated')))
            if (rated === '' || rated === 'N/A') return undefined
            return {
              rated,
              date: answer.fetchedOn,
              factId: `${PROFILE.folder}:${imdbId}`,
            }
          }),
      })
    }),
  )
}
