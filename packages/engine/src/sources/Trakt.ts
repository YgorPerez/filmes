import { createHash } from 'node:crypto'
import { Context, Effect } from 'effect'
import { field } from './json.ts'
import { Environment } from '../runtime/Environment.ts'
import { getJson, postJson, SourceFailure, Transport } from './Source.ts'

/** The app supplies consented credentials from its server-only store. */
export interface TraktConnection {
  readonly clientId: string
  readonly accessToken: (
    person: string,
    signal: AbortSignal,
  ) => Promise<string | null>
}

export const TraktAccess = Context.Reference<TraktConnection | null>(
  '@filmes/engine/sources/TraktAccess',
  { defaultValue: () => null },
)

const PROFILE = { folder: 'trakt', id: 'trakt', notFound: null }
const SKIPPED = Symbol('no Trakt consent')

const failure = (reason: string) =>
  new SourceFailure({ reason, transient: false })

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
    if (paths.recordings !== undefined && !(yield* tokenFor)) return false
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
    if (response === SKIPPED) return false
    const missing = field(field(response, 'not_found'), 'movies')
    if (!Array.isArray(missing) || missing.length > 0)
      return yield* failure('o Trakt não confirmou todos os filmes')
    return true
  })

/** Films per page of the history; Trakt caps a page there. */
const PAGE = 1000
/** Pages read at most: 50,000 plays. */
const PAGES = 50

/** What reading a Trakt profile can meet: no such user, or a private one. */
export type TraktReadFailure = 'missing' | 'private'

/** The lists of a Trakt profile, as the API gives them: the same items the
 * Raw Export's JSONs hold. */
export interface TraktLists {
  readonly history: ReadonlyArray<unknown>
  readonly ratings: ReadonlyArray<unknown>
  readonly watchlist: ReadonlyArray<unknown>
}

/** The recordings' name of a profile: `me` (the connected account) or the
 * username, lower case. */
const recordingUser = (user: string) => user.toLowerCase()

/** Reads the films of a Trakt profile (#269): its whole history, page by
 * page, its ratings and its watchlist. `user` is `me` with the Pessoa's
 * `token` (her own account, private or not), or a public username with the
 * client id alone. A 404 is `missing`, a 401 or 403 `private`; the rest is
 * a `SourceFailure`. Recorded as `get-<user>-<list>[-<page>].json`. */
export const readTraktLists = (
  user: string,
  clientId: string,
  token: string | null,
) =>
  Effect.gen(function* () {
    const transport = yield* Transport
    const headers = {
      'trakt-api-key': clientId,
      'trakt-api-version': '2',
      ...(token !== null && { Authorization: `Bearer ${token}` }),
    }
    const base = `https://api.trakt.tv/users/${encodeURIComponent(user)}`
    const name = recordingUser(user)
    const list = (path: string, key: string) =>
      transport
        .answer(
          PROFILE,
          `get-${name}-${key}`,
          getJson(`${base}${path}`, headers),
        )
        .pipe(
          Effect.catchTag('SourceFailure', (failure) =>
            /^HTTP 40[13]$/.test(failure.reason)
              ? Effect.succeed('private' as const)
              : Effect.fail(failure),
          ),
        )
    const outcome = (
      answer: unknown,
    ): ReadonlyArray<unknown> | TraktReadFailure =>
      answer === 'private'
        ? 'private'
        : Array.isArray(answer)
          ? answer
          : 'missing'
    const history: unknown[] = []
    for (let page = 1; page <= PAGES; page++) {
      const answer = outcome(
        yield* list(
          `/history/movies?page=${page}&limit=${PAGE}`,
          `history-${page}`,
        ),
      )
      if (typeof answer === 'string') {
        if (page === 1) return answer
        break
      }
      history.push(...answer)
      if (answer.length < PAGE) break
    }
    const ratings = outcome(yield* list('/ratings/movies', 'ratings'))
    if (typeof ratings === 'string') return ratings
    const watchlist = outcome(yield* list('/watchlist/movies', 'watchlist'))
    return {
      history,
      ratings,
      // A profile may hide its watchlist alone: then it has none here.
      watchlist: typeof watchlist === 'string' ? [] : watchlist,
    } satisfies TraktLists
  })
