import { createHash } from 'node:crypto'
import { Context, Effect } from 'effect'
import { field } from './json.ts'
import { Environment } from '../runtime/Environment.ts'
import { postJson, SourceFailure, Transport } from './Source.ts'

/** What the app answers when Trakt refused the Pessoa's refresh token
 * (`invalid_grant`): it dropped the grant, and she has to connect again. */
export const TRAKT_REVOKED: unique symbol = Symbol('Trakt grant revoked')

/** The app supplies consented credentials from its server-only store: the
 * token, `null` without consent, or `TRAKT_REVOKED`. */
export interface TraktConnection {
  readonly clientId: string
  readonly accessToken: (
    person: string,
    signal: AbortSignal,
  ) => Promise<string | null | typeof TRAKT_REVOKED>
}

export const TraktAccess = Context.Reference<TraktConnection | null>(
  '@filmes/engine/sources/TraktAccess',
  { defaultValue: () => null },
)

const PROFILE = { folder: 'trakt', id: 'trakt', notFound: null }
const SKIPPED = Symbol('no Trakt consent')

const failure = (reason: string) =>
  new SourceFailure({ reason, transient: false })

/** The IMDb ids in Trakt's `not_found.movies`, or `null` when the answer
 * has no such list. */
const notFound = (response: unknown): ReadonlyArray<string> | null => {
  const movies = field(field(response, 'not_found'), 'movies')
  if (!Array.isArray(movies)) return null
  return movies.flatMap((movie: unknown) => {
    const imdb = field(field(movie, 'ids'), 'imdb')
    return typeof imdb === 'string' ? [imdb] : []
  })
}

/** Posts `movies` to the Pessoa's Trakt. `null` when she has not consented,
 * `TRAKT_REVOKED` when her grant was refused; otherwise the films Trakt did
 * not find, which are a gap in its data and not a failure: the rest was
 * written. */
export const writeTrakt = (
  kind: 'history' | 'ratings',
  movies: ReadonlyArray<unknown>,
  connection: TraktConnection,
  person: string,
) =>
  Effect.gen(function* () {
    const transport = yield* Transport
    const { paths } = yield* Environment
    const tokenFor = Effect.tryPromise({
      try: (signal) => connection.accessToken(person, signal),
      catch: () => failure('não foi possível acessar a conexão com o Trakt'),
    })
    if (paths.recordings !== undefined) {
      const token = yield* tokenFor
      if (!token) return null
      if (token === TRAKT_REVOKED) return TRAKT_REVOKED
    }
    const path = `/sync/${kind}`
    const body = { movies }
    const json = JSON.stringify(body)
    const hash = createHash('sha256').update(json).digest('hex').slice(0, 12)
    const response = yield* transport.answer(
      PROFILE,
      `post-${kind}-${hash}`,
      Effect.gen(function* () {
        // Recheck consent before each attempt, including retries.
        const token = yield* tokenFor
        if (!token) return SKIPPED
        if (token === TRAKT_REVOKED) return TRAKT_REVOKED
        return yield* postJson(
          `https://api.trakt.tv${path}`,
          {
            Authorization: `Bearer ${token}`,
            'trakt-api-key': connection.clientId,
            'trakt-api-version': '2',
          },
          json,
        )
      }),
      { path, body },
    )
    if (response === SKIPPED) return null
    if (response === TRAKT_REVOKED) return TRAKT_REVOKED
    const missing = notFound(response)
    if (missing === null)
      return yield* failure('o Trakt respondeu sem a lista de não encontrados')
    return missing
  })
