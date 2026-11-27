// The web login and the Dono gate. Only a Google email on a Pessoa who is Dono
// gets a session (map #72), and the gate runs again on every request: the
// session keeps the email, and `current` looks the Owner up in filmes-dados
// each time.
//
// Routes, all under `/auth/`:
//   GET  /auth/google    starts the Google login
//   GET  /auth/callback  Google's return, shared by the web login and the
//                        MCP connector's `/oauth/authorize` (#120)
//   POST /auth/logout    ends the session
// A refusal goes back to `/entrar?recusa=<code>` (`LoginRefusal`).

import { randomBytes } from 'node:crypto'
import { openAuthDatabase, tokenHash as hash } from './auth-database'
import {
  GoogleLogin,
  readCookie,
  stubEndpoints,
  type GoogleEndpoints,
} from './google-login'
import { OAuthServer } from './oauth-server'
import {
  ownersFromDataRepo,
  peopleFromDataRepo,
  type Owner,
  type OwnerDirectory,
} from './owners'
import { serverEnv } from './server-env'
import type { LoginRefusal } from '#/content/login-refusal'

export type AuthOptions = {
  /** The site's own address: the Google redirect and the only origin a
   * POST may come from. Without it, login stays off. */
  origin?: string
  clientId?: string
  clientSecret?: string
  databasePath: string
  owners: OwnerDirectory
  personByEmail?: (email: string) => Owner | null
  endpoints?: GoogleEndpoints
  fetch?: typeof fetch
  now?: () => number
}

const SESSION_SECONDS = 30 * 24 * 60 * 60
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

function redirect(location: string, cookies: string[] = []) {
  const headers = new Headers({ location, 'cache-control': 'no-store' })
  for (const cookie of cookies) headers.append('set-cookie', cookie)
  return new Response(null, { status: 303, headers })
}

const refused = (refusal: LoginRefusal, cookies: string[] = []) =>
  redirect(`/entrar?recusa=${refusal}`, cookies)

const plain = (status: number, message: string) =>
  new Response(message, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
    },
  })

/** Server only. Never send the email or a token to the browser. */
export class Auth {
  private readonly options: AuthOptions
  private readonly now: () => number
  private readonly secure: boolean
  private readonly sessionName: string
  readonly google: GoogleLogin | null
  /** The MCP connector's authorization server (#120): on with the login. */
  readonly oauth: OAuthServer | null

  constructor(options: AuthOptions) {
    this.options = options
    this.now = options.now ?? Date.now
    this.secure = options.origin?.startsWith('https://') ?? true
    this.sessionName = this.secure ? '__Host-session' : 'local-session'
    const { origin, clientId, clientSecret } = options
    this.google =
      origin &&
      clientId &&
      clientSecret &&
      (this.secure || LOCAL_ORIGIN.test(origin))
        ? new GoogleLogin({
            database: () => this.database(),
            clientId,
            clientSecret,
            redirectUri: `${origin}/auth/callback`,
            secure: this.secure,
            endpoints: options.endpoints,
            fetch: options.fetch,
            now: this.now,
          })
        : null
    this.oauth =
      this.google && origin
        ? new OAuthServer({
            origin,
            google: this.google,
            database: () => this.database(),
            owners: options.owners,
            now: this.now,
          })
        : null
  }

  /** `auth.sqlite`, migrated. The caller closes it. */
  database() {
    return openAuthDatabase(this.options.databasePath)
  }

  private cookie(value: string, seconds: number) {
    return `${this.sessionName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${this.secure ? '; Secure' : ''}`
  }

  /** A verified Google email under a live login cookie. */
  verifiedSession(request: Request): { email: string; hash: string } | null {
    const token = readCookie(request, this.sessionName)
    if (!token || !this.google) return null
    const sessionHash = hash(token)
    const db = this.database()
    let email: unknown
    try {
      email = db
        .prepare(
          'SELECT email FROM web_sessions WHERE token_hash = ? AND expires_at > ?',
        )
        .get(sessionHash, this.now())?.email
    } finally {
      db.close()
    }
    return typeof email === 'string' ? { email, hash: sessionHash } : null
  }

  /** The Dono of this request, or null. */
  current(request: Request): Owner | null {
    const login = this.verifiedSession(request)
    return login ? this.options.owners.ownerByEmail(login.email) : null
  }

  /** The answer for a `/auth/*` request, or null for any other path. */
  async handle(request: Request): Promise<Response | null> {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/auth/')) return null
    if (url.pathname === '/auth/google' && request.method === 'GET')
      return this.google?.start('web') ?? refused('indisponivel')
    if (url.pathname === '/auth/trakt-google' && request.method === 'GET')
      return this.options.personByEmail && this.google
        ? this.google.start('trakt')
        : redirect('/trakt?erro=login')
    if (url.pathname === '/auth/callback' && request.method === 'GET')
      return this.callback(request)
    if (url.pathname === '/auth/logout' && request.method === 'POST')
      return request.headers.get('origin') === this.options.origin
        ? this.logout(request)
        : plain(403, 'Abra o filmes neste site e tente de novo.')
    return plain(404, 'Página não encontrada.')
  }

  private async callback(request: Request) {
    if (!this.google) return refused('indisponivel')
    const clear = this.google.clearCookie()
    const result = await this.google.finish(request)
    if (!result.ok)
      return refused(result.reason === 'expired' ? 'expirou' : 'google', [
        clear,
      ])
    // The MCP connector's login (`oauth-server.ts`) answers its client,
    // with the same Dono gate.
    if (result.purpose === 'mcp' && this.oauth)
      return this.oauth.resume(result.email, result.payload, clear)
    if (result.purpose === 'trakt') {
      if (!this.options.personByEmail?.(result.email))
        return redirect('/trakt?erro=login', [clear])
      return redirect('/trakt', [
        this.createSession(request, result.email),
        clear,
      ])
    }
    if (result.purpose !== 'web') return refused('expirou', [clear])
    if (!this.options.owners.ownerByEmail(result.email))
      return refused('nao-dono', [clear])
    return redirect('/', [this.createSession(request, result.email), clear])
  }

  private createSession(request: Request, email: string) {
    const token = randomBytes(32).toString('base64url')
    const previous = readCookie(request, this.sessionName)
    const db = this.database()
    try {
      db.prepare('DELETE FROM web_sessions WHERE expires_at <= ?').run(
        this.now(),
      )
      if (previous)
        db.prepare('DELETE FROM web_sessions WHERE token_hash = ?').run(
          hash(previous),
        )
      db.prepare('INSERT INTO web_sessions VALUES (?, ?, ?)').run(
        hash(token),
        email,
        this.now() + SESSION_SECONDS * 1000,
      )
    } finally {
      db.close()
    }
    return this.cookie(token, SESSION_SECONDS)
  }

  private logout(request: Request) {
    const token = readCookie(request, this.sessionName)
    if (token) {
      const db = this.database()
      try {
        db.prepare('DELETE FROM web_sessions WHERE token_hash = ?').run(
          hash(token),
        )
      } finally {
        db.close()
      }
    }
    return redirect('/entrar', [this.cookie('', 0)])
  }
}

/** The app's Auth, from the environment (`server-env.ts`). Read on each call,
 * as the Pessoas are. */
export function authFromEnvironment(variables = process.env) {
  const env = serverEnv(variables)
  // A stand-in for Google, for the e2e only: honoured on a local origin, so
  // a stray variable on the VPS cannot send the login elsewhere.
  const stub =
    env.GOOGLE_STUB_ORIGIN &&
    env.APP_ORIGIN &&
    LOCAL_ORIGIN.test(env.APP_ORIGIN)
      ? stubEndpoints(env.GOOGLE_STUB_ORIGIN)
      : undefined
  return new Auth({
    origin: env.APP_ORIGIN,
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    databasePath: env.AUTH_DATABASE_PATH,
    owners: ownersFromDataRepo(env.DATA_REPO_PATH),
    personByEmail: env.FILMES_TRAKT_CLIENT_ID
      ? peopleFromDataRepo(env.DATA_REPO_PATH).byEmail
      : undefined,
    endpoints: stub,
  })
}

export const handleAuthRequest = (request: Request) =>
  authFromEnvironment().handle(request)

export const currentOwner = (request: Request) =>
  authFromEnvironment().current(request)
