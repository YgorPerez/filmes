import { randomBytes } from 'node:crypto'
import {
  TRAKT_PATH as PAGE,
  TRAKT_CONNECT as CONNECT,
  TRAKT_DISCONNECT as DISCONNECT,
} from '#/content/trakt-form'
import type { TraktConnection } from '@filmes/engine'
import { authFromEnvironment } from './auth'
import { tokenHash } from './auth-database'
import { peopleFromDataRepo } from './people-directory'
import { serverEnv } from './server-env'
import {
  TraktGrantRefused,
  TraktStore,
  type TraktIdentity,
  type TraktTokens,
} from './trakt-store'

const CALLBACK = '/trakt/retorno'
/** Trakt's Cloudflare answers 403 to fetch's default `node` User-Agent; the
 * engine's Trakt calls send the same `filmes`. */
const TRAKT_HEADERS = {
  'content-type': 'application/json',
  'user-agent': 'filmes',
}

/** Trakt's answer to a refresh token it no longer takes. */
const refused = async (response: Response) => {
  if (response.status !== 400 && response.status !== 401) return false
  const body: unknown = await response.json().catch(() => null)
  return (
    !!body &&
    typeof body === 'object' &&
    (body as Record<string, unknown>).error === 'invalid_grant'
  )
}

/** Back to a page; its own, as `oauth-server.ts` builds its answers. */
const seeOther = (location: string) =>
  new Response(null, {
    status: 303,
    headers: { Location: location, 'Cache-Control': 'private, no-store' },
  })

type TraktOptions = {
  origin: string
  clientId: string
  tokenKey: Buffer
  databasePath: string
  fetch?: typeof fetch
  now?: () => number
}

export class Trakt {
  private readonly store: TraktStore
  private readonly redirectUri: string
  private readonly fetch: typeof fetch
  private readonly now: () => number

  constructor(private readonly options: TraktOptions) {
    this.store = new TraktStore(options.databasePath, options.tokenKey)
    this.redirectUri = `${options.origin}${CALLBACK}`
    this.fetch = options.fetch ?? fetch
    this.now = options.now ?? Date.now
  }

  connected(identity: TraktIdentity) {
    return this.store.connected(identity)
  }

  accessToken(identity: TraktIdentity, signal: AbortSignal) {
    return this.store.access(identity, this.now(), (refresh_token) =>
      this.exchange({ grant_type: 'refresh_token', refresh_token }, signal),
    )
  }

  async handle(
    request: Request,
    identity: (TraktIdentity & { sessionHash: string }) | null,
  ) {
    const url = new URL(request.url)
    if (!identity) return seeOther(PAGE)
    try {
      if (url.pathname === CALLBACK && request.method === 'GET')
        return await this.complete(url, identity)
      if (request.method !== 'POST') return new Response(null, { status: 405 })
      if (request.headers.get('origin') !== this.options.origin)
        return new Response('Origem recusada', { status: 403 })
      if (url.pathname === DISCONNECT) {
        const tokens = this.store.disconnect(identity)
        if (tokens) await this.revoke(tokens.access)
        return seeOther(PAGE)
      }
      const form = await request.formData()
      if (form.get('consentir') !== 'sim')
        return seeOther(`${PAGE}?erro=consentimento`)
      const state = randomBytes(32).toString('base64url')
      const verifier = randomBytes(32).toString('base64url')
      this.store.begin({ ...identity, state }, verifier, this.now())
      const authorize = new URL('https://auth.trakt.tv/oauth/authorize')
      authorize.search = new URLSearchParams({
        client_id: this.options.clientId,
        redirect_uri: this.redirectUri,
        response_type: 'code',
        prompt: 'login',
        state,
        code_challenge: tokenHash(verifier),
        code_challenge_method: 'S256',
      }).toString()
      return seeOther(authorize.href)
    } catch (error) {
      // Our own fixed messages, or fetch's ("fetch failed", a timeout).
      console.warn(
        `Trakt connection failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
      return seeOther(`${PAGE}?erro=trakt`)
    }
  }

  private async complete(
    url: URL,
    identity: TraktIdentity & { sessionHash: string },
  ) {
    const state = url.searchParams.get('state')
    const code = url.searchParams.get('code')
    if (!state || !code) return seeOther(`${PAGE}?erro=trakt`)
    const attempt = { ...identity, state }
    const verifier = this.store.claim(attempt, this.now())
    if (verifier === null) return seeOther(`${PAGE}?erro=trakt`)
    try {
      const tokens = await this.exchange({
        grant_type: 'authorization_code',
        code,
        code_verifier: verifier,
      })
      if (this.store.finish(attempt, tokens, this.now())) return seeOther(PAGE)
      console.warn('Trakt connection not kept: the login or attempt changed')
      return seeOther(`${PAGE}?erro=trakt`)
    } finally {
      this.store.forget(attempt)
    }
  }

  /** Best effort: the local grant is already gone, so a Trakt that does not
   * answer changes nothing for the Pessoa. */
  private async revoke(token: string) {
    try {
      await this.fetch('https://api.trakt.tv/oauth/revoke', {
        method: 'POST',
        headers: TRAKT_HEADERS,
        redirect: 'error',
        signal: AbortSignal.timeout(5_000),
        body: JSON.stringify({ token, client_id: this.options.clientId }),
      })
    } catch {
      // Ignored: the tokens expire on their own.
    }
  }

  private async exchange(
    grant: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<TraktTokens> {
    const timeout = AbortSignal.timeout(10_000)
    const response = await this.fetch('https://auth.trakt.tv/oauth/token', {
      method: 'POST',
      headers: TRAKT_HEADERS,
      redirect: 'error',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      body: JSON.stringify({
        ...grant,
        client_id: this.options.clientId,
        redirect_uri: this.redirectUri,
      }),
    })
    if (!response.ok) {
      const error = await oauthError(response.clone())
      // The status and OAuth error code only: never a token or the body.
      console.warn(
        `Trakt OAuth ${grant.grant_type} failed: HTTP ${response.status}${error ? ` ${error}` : ''}`,
      )
      if (grant.grant_type === 'refresh_token' && (await refused(response)))
        throw new TraktGrantRefused()
      throw new Error('Trakt OAuth exchange failed')
    }
    const body: unknown = await response.json()
    if (!body || typeof body !== 'object')
      throw new Error('Invalid Trakt OAuth response')
    const { access_token, refresh_token, expires_in } = body as Record<
      string,
      unknown
    >
    if (
      typeof access_token !== 'string' ||
      !access_token ||
      typeof refresh_token !== 'string' ||
      !refresh_token ||
      typeof expires_in !== 'number' ||
      !Number.isSafeInteger(expires_in) ||
      expires_in <= 0
    ) {
      // The field names only, never their values.
      console.warn(
        `Trakt OAuth ${grant.grant_type} answer is incomplete: ${Object.keys(body).join(', ')}`,
      )
      throw new Error('Invalid Trakt OAuth response')
    }
    return {
      access: access_token,
      refresh: refresh_token,
      expiresAt: this.now() + expires_in * 1000,
    }
  }
}

function traktOptions(env: ReturnType<typeof serverEnv>): TraktOptions | null {
  const {
    APP_ORIGIN: origin,
    FILMES_TRAKT_CLIENT_ID: clientId,
    FILMES_TRAKT_TOKEN_KEY,
    AUTH_DATABASE_PATH,
  } = env
  if (
    !origin?.startsWith('https://') &&
    !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin ?? '')
  )
    return null
  if (!origin || !clientId || !FILMES_TRAKT_TOKEN_KEY) return null
  const tokenKey = Buffer.from(FILMES_TRAKT_TOKEN_KEY, 'base64')
  if (tokenKey.length !== 32) return null
  return {
    origin,
    clientId,
    tokenKey,
    databasePath: AUTH_DATABASE_PATH,
  }
}

export function traktConnection(
  variables: NodeJS.ProcessEnv,
): TraktConnection | undefined {
  const env = serverEnv(variables)
  const options = traktOptions(env)
  // The client id alone reads public profiles by username (#269).
  if (!options)
    return env.FILMES_TRAKT_CLIENT_ID
      ? { clientId: env.FILMES_TRAKT_CLIENT_ID, accessToken: async () => null }
      : undefined
  const trakt = new Trakt(options)
  const directory = peopleFromDataRepo(env.DATA_REPO_PATH)
  return {
    clientId: options.clientId,
    async accessToken(slug, signal) {
      const identity = directory.bySlug(slug)
      return identity ? trakt.accessToken(identity, signal) : null
    },
  }
}

function browserTrakt(request: Request) {
  const env = serverEnv()
  const options = traktOptions(env)
  if (!options) return null
  const auth = authFromEnvironment()
  if (!auth.google) return null
  const session = auth.verifiedSession(request)
  const person =
    session && peopleFromDataRepo(env.DATA_REPO_PATH).byEmail(session.email)
  return {
    trakt: new Trakt(options),
    identity:
      person && session ? { ...person, sessionHash: session.hash } : null,
  }
}

export function traktPage(request: Request) {
  const browser = browserTrakt(request)
  if (!browser) return { status: 'unavailable' } as const
  if (!browser.identity) return { status: 'login' } as const
  return {
    status: browser.trakt.connected(browser.identity)
      ? 'connected'
      : 'disconnected',
    name: browser.identity.name,
  } as const
}

export function handleTraktRequest(request: Request) {
  const { pathname } = new URL(request.url)
  if (pathname !== CONNECT && pathname !== CALLBACK && pathname !== DISCONNECT)
    return null
  const browser = browserTrakt(request)
  return browser
    ? browser.trakt.handle(request, browser.identity)
    : seeOther(PAGE)
}

/** What a Pessoa's import page needs of Trakt (#269): whether the server
 * reads Trakt at all (a client id), and whether she connected her account
 * (which only she can do, at `/trakt`). */
export function traktLink(
  slug: string,
  variables: NodeJS.ProcessEnv = process.env,
): { available: boolean; connected: boolean } {
  const env = serverEnv(variables)
  if (!env.FILMES_TRAKT_CLIENT_ID) return { available: false, connected: false }
  const options = traktOptions(env)
  const identity =
    options && peopleFromDataRepo(env.DATA_REPO_PATH).bySlug(slug)
  return {
    available: true,
    connected: Boolean(
      options && identity && new Trakt(options).connected(identity),
    ),
  }
}

/** The `error` code of an OAuth error answer (`invalid_grant`,
 * `invalid_client`...), when it is one: a short word, safe to log. */
async function oauthError(response: Response) {
  try {
    const body: unknown = await response.json()
    const error =
      body && typeof body === 'object'
        ? (body as { error?: unknown }).error
        : null
    return typeof error === 'string' && /^[a-z_]{1,40}$/.test(error)
      ? error
      : null
  } catch {
    return null
  }
}
