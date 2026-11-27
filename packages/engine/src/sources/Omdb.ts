// OMDb: the `Rated` field, for the child Restrição when no local source has
// an age rating (`filmes/sob_demanda/omdb.py`), and the critics' score
// (Rotten Tomatoes, Metacritic) of the same answer (#282). Cached for 30
// days; the key is FILMES_OMDB_CHAVE.
//
// OMDb's terms forbid building an index: only a film that would reach a
// Session's top 50 is looked up.
//
// The age rating and the critics' score are two profiles of one API, like
// TMDB's: one cache, and each is turned off and warns with its own
// consequence. Without the key the critics' score asks nothing and does
// not warn: it is a bonus the order does without, and the child
// Restrição already says the key is missing when it needs it.

import { Context, Effect, Layer } from 'effect'
import { casefold, pyStrip } from '../compat/index.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import { Environment } from '../runtime/Environment.ts'
import type { Run } from '../runtime/Run.ts'
import type { SqliteError } from '../sqlite/Sqlite.ts'
import { field, list, text } from './json.ts'
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

const CRITICS_PROFILE: SourceProfile = {
  ...PROFILE,
  id: 'omdb-critics',
  withoutIt: 'os filmes saem sem a nota da crítica',
}

/** A film's age rating as OMDb gives it. */
export interface OmdbRating {
  /** As it came: "PG-13", "Not Rated". */
  readonly rated: string
  /** The day it was fetched. */
  readonly date: string
  readonly factId: string
}

/** The critics' score of a film, each from 0 to 100. */
interface OmdbCritics {
  /** The Tomatometer: "93%". */
  readonly rottenTomatoes: number | undefined
  /** The Metascore: "81". */
  readonly metacritic: number | undefined
  /** The day it was fetched. */
  readonly date: string
}

/** A whole number from 0 to 100 at the start of `value` ("93%", "81/100",
 * "81"); `undefined` for "N/A" and anything else. */
const score = (value: unknown): number | undefined => {
  const match = /^\s*(\d{1,3})(?:%|\/100)?\s*$/u.exec(text(value))
  if (match === null) return undefined
  const number = Number(match[1])
  return number <= 100 ? number : undefined
}

/** The `Value` of the `Ratings` entry from `source`. */
const ratingFrom = (body: unknown, source: string): unknown =>
  field(
    list(field(body, 'Ratings')).find(
      (entry) => field(entry, 'Source') === source,
    ),
    'Value',
  )

export class Omdb extends Context.Service<
  Omdb,
  {
    /** The film's `Rated`, or `undefined` with no answer or no value. */
    readonly ageRating: (
      imdbId: string,
    ) => Effect.Effect<OmdbRating | undefined, EngineError | SqliteError, Run>
    /** The film's critics' score, or `undefined` with no key, no answer or
     * neither score. */
    readonly critics: (
      imdbId: string,
    ) => Effect.Effect<OmdbCritics | undefined, EngineError | SqliteError, Run>
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
      const hasKey =
        (yield* Environment).sourceKeys[PROFILE.keyVariable] !== undefined

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
        critics: (imdbId) =>
          hasKey
            ? Effect.map(
                obtain(CRITICS_PROFILE, imdbId, live(imdbId)),
                (answer) => {
                  if (
                    answer === undefined ||
                    field(answer.body, 'Response') !== 'True'
                  )
                    return undefined
                  const rottenTomatoes = score(
                    ratingFrom(answer.body, 'Rotten Tomatoes'),
                  )
                  const metacritic =
                    score(field(answer.body, 'Metascore')) ??
                    score(ratingFrom(answer.body, 'Metacritic'))
                  if (rottenTomatoes === undefined && metacritic === undefined)
                    return undefined
                  return {
                    rottenTomatoes,
                    metacritic,
                    date: answer.fetchedOn,
                  }
                },
              )
            : Effect.undefined,
      })
    }),
  )
}
