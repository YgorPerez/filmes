import { createHash } from 'node:crypto'
import { Context, Effect } from 'effect'
import { field } from './json.ts'
import { Environment } from '../runtime/Environment.ts'
import { postJson, SourceFailure, Transport } from './Source.ts'

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
