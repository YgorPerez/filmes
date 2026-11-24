// The hand-written Google login, in the shape of pesquisa-relacionamentos'
// `accounts.ts`: authorization code with PKCE, the state bound to the browser
// by a cookie and consumed once, and from Google only the verified email.
// Tokens and every other identity field are dropped.
//
// It knows nothing of who may enter. The caller starts an attempt with a
// `purpose` and a `payload` and gets them back with the email at the
// callback: the web login (`auth.ts`) uses `web`, and the MCP `/authorize` of
// #120 starts its own purpose and resumes its flow with the payload.

import { randomBytes } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { normalizeEmail } from './owners'
import { tokenHash as hash } from './auth-database'

export type GoogleEndpoints = {
  authorize: string
  token: string
  userinfo: string
}

const GOOGLE_ENDPOINTS: GoogleEndpoints = {
  authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
  token: 'https://oauth2.googleapis.com/token',
  userinfo: 'https://openidconnect.googleapis.com/v1/userinfo',
}

/** The same endpoints on a stand-in for Google (the e2e's `fake-google.ts`). */
export const stubEndpoints = (origin: string): GoogleEndpoints => ({
  authorize: `${origin}/authorize`,
  token: `${origin}/token`,
  userinfo: `${origin}/userinfo`,
})

export type GoogleLoginOptions = {
  database: () => DatabaseSync
  clientId: string
  clientSecret: string
  /** The app's callback, registered on the Google OAuth client. */
  redirectUri: string
  /** Whether the cookie gets `__Host-` and `Secure` (https). */
  secure: boolean
  endpoints?: GoogleEndpoints
  fetch?: typeof fetch
  now?: () => number
}

export type GoogleResult =
  | { ok: true; email: string; purpose: string; payload: string }
  /** `expired`: no live attempt for this state and browser (old tab, second
   * use, another browser). `google`: Google refused or did not answer, or
   * the email is not verified. */
  | { ok: false; reason: 'expired' | 'google' }

const ATTEMPT_MS = 10 * 60_000
const random = () => randomBytes(32).toString('base64url')

export class GoogleLogin {
  private readonly options: GoogleLoginOptions
  private readonly endpoints: GoogleEndpoints
  private readonly fetch: typeof fetch
  private readonly now: () => number
  readonly cookieName: string

  constructor(options: GoogleLoginOptions) {
    this.options = options
    this.endpoints = options.endpoints ?? GOOGLE_ENDPOINTS
    this.fetch = options.fetch ?? fetch
    this.now = options.now ?? Date.now
    this.cookieName = options.secure ? '__Host-google' : 'local-google'
  }

  private cookie(value: string, seconds: number) {
    return `${this.cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${this.options.secure ? '; Secure' : ''}`
  }

  /** The cookie that forgets the attempt, for the callback's response. */
  readonly clearCookie = () => this.cookie('', 0)

  /** A 303 to Google's consent screen, with the browser cookie. */
  start(purpose: string, payload = ''): Response {
    const state = random(),
      browser = random(),
      verifier = random()
    const db = this.options.database()
    try {
      db.prepare('DELETE FROM google_attempts WHERE expires_at <= ?').run(
        this.now(),
      )
      db.prepare('INSERT INTO google_attempts VALUES (?, ?, ?, ?, ?, ?)').run(
        hash(state),
        hash(browser),
        verifier,
        purpose,
        payload,
        this.now() + ATTEMPT_MS,
      )
    } finally {
      db.close()
    }
    const target = new URL(this.endpoints.authorize)
    target.search = new URLSearchParams({
      client_id: this.options.clientId,
      redirect_uri: this.options.redirectUri,
      response_type: 'code',
      scope: 'openid email',
      state,
      code_challenge: hash(verifier),
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString()
    return new Response(null, {
      status: 303,
      headers: {
        location: target.href,
        'set-cookie': this.cookie(browser, ATTEMPT_MS / 1000),
        'cache-control': 'no-store',
      },
    })
  }

  /** Consumes the attempt (before calling Google, so a replay finds
   * nothing) and trades the code for the verified email. */
  async finish(request: Request): Promise<GoogleResult> {
    const url = new URL(request.url)
    const state = url.searchParams.get('state')
    const code = url.searchParams.get('code')
    const browser = readCookie(request, this.cookieName)
    if (!state || !browser) return { ok: false, reason: 'expired' }
    const db = this.options.database()
    let attempt: Record<string, unknown> | undefined
    try {
      attempt = db
        .prepare(
          'DELETE FROM google_attempts WHERE state_hash = ? AND browser_hash = ? AND expires_at > ? RETURNING verifier, purpose, payload',
        )
        .get(hash(state), hash(browser), this.now())
    } finally {
      db.close()
    }
    if (!attempt) return { ok: false, reason: 'expired' }
    if (!code) return { ok: false, reason: 'google' }
    try {
      const email = await this.verifiedEmail(code, String(attempt.verifier))
      return email
        ? {
            ok: true,
            email,
            purpose: String(attempt.purpose),
            payload: String(attempt.payload),
          }
        : { ok: false, reason: 'google' }
    } catch {
      // Codes, tokens and identity never reach a log.
      return { ok: false, reason: 'google' }
    }
  }

  private async verifiedEmail(code: string, verifier: string) {
    const tokenResponse = await this.fetch(this.endpoints.token, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({
        code,
        client_id: this.options.clientId,
        client_secret: this.options.clientSecret,
        redirect_uri: this.options.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
    })
    if (!tokenResponse.ok) return null
    const token: unknown = await tokenResponse.json()
    if (!isRecord(token) || typeof token.access_token !== 'string') return null
    const identityResponse = await this.fetch(this.endpoints.userinfo, {
      headers: { authorization: `Bearer ${token.access_token}` },
      redirect: 'error',
      signal: AbortSignal.timeout(10_000),
    })
    if (!identityResponse.ok) return null
    const identity: unknown = await identityResponse.json()
    return isRecord(identity) &&
      identity.email_verified === true &&
      typeof identity.email === 'string' &&
      identity.email.length <= 320
      ? normalizeEmail(identity.email)
      : null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export function readCookie(request: Request, name: string) {
  return request.headers
    .get('cookie')
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}
