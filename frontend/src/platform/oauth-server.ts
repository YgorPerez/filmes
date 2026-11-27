// The OAuth authorization server of the MCP connector (#120, ADR 0007),
// hand-written because SDK v2 dropped its own (#75): the SDK only verifies
// the tokens this file issues (`mcp-endpoint.ts`). What claude.ai's custom
// connector needs and nothing more:
//
//   GET  /.well-known/oauth-authorization-server   RFC 8414 metadata
//   POST /oauth/register    dynamic client registration (RFC 7591), public
//                           clients only, redirects from the allowlist
//   GET  /oauth/authorize   authorization code with PKCE S256; the login is
//                           the web login's Google flow and its Dono gate
//   POST /oauth/token       code exchange and refresh with rotation
//   POST /oauth/revoke      RFC 7009: ends the grant of a token
//
// Every code and token is random, given to the client once and stored only
// by its hash (`auth.sqlite`). A grant keeps the email, not the Pessoa: the
// Dono gate runs again on each refresh and each MCP request, so a Pessoa who
// stops being Dono loses the connector at once. Nothing here logs a value.

import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import {
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
} from '@modelcontextprotocol/server'
import { tokenHash as hash } from './auth-database'
import type { GoogleLogin } from './google-login'

/** What a token carries of its Dono: her slug, the `Owner` of each call,
 * the email the gate matched, and whether she is admin (the MCP's admin
 * tools). */
type Owner = { person: string; email: string; admin?: boolean }

export type OAuthServerOptions = {
  /** The site's address (`APP_ORIGIN`): the issuer. */
  origin: string
  google: GoogleLogin
  database: () => DatabaseSync
  /** The Dono gate: the login's `OwnerDirectory` (`owners.ts`). */
  owners: { ownerByEmail(email: string): Owner | null }
  now: () => number
}

/** The scope every token carries; `offline_access` is accepted and adds
 * nothing (a refresh token always comes). */
export const MCP_SCOPE = 'mcp'
const SCOPES = [MCP_SCOPE, 'offline_access']

const CODE_MS = 5 * 60_000
const ACCESS_SECONDS = 60 * 60
const REFRESH_MS = 90 * 24 * 60 * 60_000
/** A client nobody finished connecting with goes after a day. */
const IDLE_CLIENT_MS = 24 * 60 * 60_000
const MAX_BODY_BYTES = 16 * 1024
const MAX_REDIRECTS = 10

/** Where claude.ai (web, Desktop, mobile, Cowork) sends the code back (#75).
 * claude.com is Anthropic's other domain for the same app. */
const CLAUDE_CALLBACKS = new Set([
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
])
// Stable ChatGPT callback for issuers that identify themselves per RFC 9207.
const CHATGPT_CALLBACK = 'https://chatgpt.com/connector_platform_oauth_redirect'
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

const random = () => randomBytes(32).toString('base64url')
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/

function loopback(uri: string): URL | null {
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return null
  }
  return url.protocol === 'http:' &&
    LOOPBACK_HOSTS.has(url.hostname) &&
    !url.username &&
    !url.password &&
    !url.hash
    ? url
    : null
}

/** Hosted callbacks match exactly. Loopback clients can use any port (RFC 8252). */
export const allowedRedirect = (uri: string) =>
  uri === CHATGPT_CALLBACK ||
  CLAUDE_CALLBACKS.has(uri) ||
  loopback(uri) !== null

/** Whether `requested` is `registered`; a loopback redirect matches on any
 * port (RFC 8252 §7.3), since the client picks a free one each time. */
function sameRedirect(registered: string, requested: string) {
  if (registered === requested) return true
  const a = loopback(registered)
  const b = loopback(requested)
  if (!a || !b) return false
  a.port = ''
  b.port = ''
  return a.href === b.href
}

const sameHash = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

const noStore = {
  'cache-control': 'no-store',
  pragma: 'no-cache',
  // Discovery, registration and the token endpoint are called from
  // browsers too (the MCP Inspector); no cookie counts on them.
  'access-control-allow-origin': '*',
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: noStore })

const oauthError = (error: string, description: string, status = 400) =>
  json({ error, error_description: description }, status)

const plain = (status: number, message: string) =>
  new Response(message, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
    },
  })

const preflight = () =>
  new Response(null, {
    status: 204,
    headers: {
      ...noStore,
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers':
        'authorization, content-type, mcp-protocol-version',
    },
  })

/** The body as text, or null past the bound. */
async function readBody(request: Request) {
  const text = await request.text()
  return Buffer.byteLength(text) > MAX_BODY_BYTES ? null : text
}

/** One value per name (RFC 6749 §3.1): a repeated one is refused. */
function single(params: URLSearchParams, name: string) {
  const values = params.getAll(name)
  if (values.length > 1) throw new ParamError(name)
  return values[0] || undefined
}

class ParamError extends Error {
  constructor(readonly param: string) {
    super(param)
  }
}

/** What `/oauth/authorize` hands the Google flow, back at the callback. */
type Pending = {
  clientId: string
  redirectUri: string
  state: string | undefined
  codeChallenge: string
  scope: string
  resource: string
}

type Row = Record<string, unknown>

/** The registration's fields we keep, or the RFC 7591 error to answer. */
function clientMetadata(text: string | null) {
  const invalid = (description: string) =>
    oauthError('invalid_client_metadata', description)
  if (text === null) return invalid('The body is too big.')
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return invalid('The body is not JSON.')
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    return invalid('The body is not an object.')
  const metadata = body as Row
  const uris = metadata.redirect_uris
  if (
    !Array.isArray(uris) ||
    uris.length === 0 ||
    uris.length > MAX_REDIRECTS ||
    !uris.every((uri) => typeof uri === 'string' && allowedRedirect(uri))
  )
    return oauthError(
      'invalid_redirect_uri',
      'Only the supported host callbacks and loopback redirects are allowed.',
    )
  const grants = metadata.grant_types
  const grantsOk =
    grants === undefined ||
    (Array.isArray(grants) &&
      grants.every((g) => g === 'authorization_code' || g === 'refresh_token'))
  if (!grantsOk)
    return invalid('Only authorization_code and refresh_token are supported.')
  const name =
    typeof metadata.client_name === 'string'
      ? metadata.client_name.slice(0, 200)
      : ''
  return { uris: uris as string[], name }
}

export class OAuthServer {
  private readonly options: OAuthServerOptions
  /** The connector URL, the `resource` of every token. */
  readonly resource: string

  constructor(options: OAuthServerOptions) {
    this.options = options
    this.resource = `${options.origin}/mcp`
  }

  /** RFC 8414. claude.ai uses DCR: CIMD is not advertised. */
  metadata() {
    const { origin } = this.options
    return {
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      registration_endpoint: `${origin}/oauth/register`,
      revocation_endpoint: `${origin}/oauth/revoke`,
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      revocation_endpoint_auth_methods_supported: ['none'],
      scopes_supported: SCOPES,
      authorization_response_iss_parameter_supported: true,
    }
  }

  /** Each route, by `METHOD /path`. */
  private readonly routes: Record<
    string,
    (request: Request) => Response | Promise<Response>
  > = {
    'GET /.well-known/oauth-authorization-server': () => json(this.metadata()),
    'POST /oauth/register': (request) => this.register(request),
    'GET /oauth/authorize': (request) =>
      this.authorize(new URL(request.url).searchParams),
    'POST /oauth/token': (request) => this.token(request),
    'POST /oauth/revoke': (request) => this.revoke(request),
  }

  /** The answer for a path of this server, or null for any other. */
  async handle(request: Request): Promise<Response | null> {
    const { pathname } = new URL(request.url)
    if (
      pathname !== '/.well-known/oauth-authorization-server' &&
      !pathname.startsWith('/oauth/')
    )
      return null
    if (request.method === 'OPTIONS') return preflight()
    const route = this.routes[`${request.method} ${pathname}`]
    if (!route) return plain(404, 'Página não encontrada.')
    try {
      return await route(request)
    } catch (error) {
      if (!(error instanceof ParamError)) throw error
      return pathname === '/oauth/authorize'
        ? plain(400, `Parâmetro repetido: ${error.param}.`)
        : oauthError('invalid_request', `Repeated parameter: ${error.param}.`)
    }
  }

  private db<A>(task: (db: DatabaseSync) => A): A {
    const db = this.options.database()
    try {
      return task(db)
    } finally {
      db.close()
    }
  }

  private async register(request: Request) {
    const metadata = clientMetadata(await readBody(request))
    if (metadata instanceof Response) return metadata
    const { uris, name } = metadata
    const clientId = random()
    const now = this.options.now()
    this.db((db) => {
      db.prepare(
        `DELETE FROM oauth_clients WHERE created_at <= ? AND NOT EXISTS
          (SELECT 1 FROM oauth_grants g WHERE g.client_id = oauth_clients.client_id)`,
      ).run(now - IDLE_CLIENT_MS)
      db.prepare('INSERT INTO oauth_clients VALUES (?, ?, ?, ?)').run(
        clientId,
        name,
        JSON.stringify(uris),
        now,
      )
    })
    // Whatever authentication the client asked for, it is public: the
    // answer says so (RFC 7591 §3.2.1 lets the server replace a value).
    return json(
      {
        client_id: clientId,
        client_id_issued_at: Math.floor(now / 1000),
        client_name: name || undefined,
        redirect_uris: uris,
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
      },
      201,
    )
  }

  private client(clientId: string | undefined) {
    if (!clientId) return null
    const row = this.db((db) =>
      db
        .prepare('SELECT redirect_uris FROM oauth_clients WHERE client_id = ?')
        .get(clientId),
    )
    return row ? (JSON.parse(String(row.redirect_uris)) as string[]) : null
  }

  /** The scopes asked for, or null if one is unknown. Every token gets
   * `mcp`, the only one that grants anything. */
  private scope(requested: string | undefined) {
    const asked = (requested ?? '').split(' ').filter(Boolean)
    if (!asked.every((scope) => SCOPES.includes(scope))) return null
    return [...new Set([MCP_SCOPE, ...asked])].join(' ')
  }

  /** A resource the client named must be this server (RFC 8707). */
  private sameResource(resource: string | undefined) {
    return (
      resource === undefined || resource.replace(/\/$/, '') === this.resource
    )
  }

  private authorize(params: URLSearchParams) {
    const clientId = single(params, 'client_id')
    const registered = this.client(clientId)
    // Until the client and the redirect are known, the error stays here:
    // a redirect to an unchecked address is an open redirector.
    if (!registered)
      return plain(
        400,
        'Este aplicativo não está registrado no filmes. Conecte o filmes de novo no seu chat.',
      )
    const asked = single(params, 'redirect_uri')
    const redirectUri =
      asked === undefined
        ? registered.length === 1
          ? registered[0]!
          : undefined
        : registered.some((uri) => sameRedirect(uri, asked))
          ? asked
          : undefined
    if (redirectUri === undefined)
      return plain(
        400,
        'O endereço de retorno deste aplicativo não confere. Conecte o filmes de novo no seu chat.',
      )
    const state = single(params, 'state')
    const back = (error: string, description: string) =>
      this.toClient(redirectUri, {
        error,
        error_description: description,
        state,
      })
    if (single(params, 'response_type') !== 'code')
      return back('unsupported_response_type', 'Only response_type=code.')
    const codeChallenge = single(params, 'code_challenge')
    if (
      single(params, 'code_challenge_method') !== 'S256' ||
      !codeChallenge ||
      !CHALLENGE.test(codeChallenge)
    )
      return back('invalid_request', 'PKCE with S256 is required.')
    const scope = this.scope(single(params, 'scope'))
    if (scope === null) return back('invalid_scope', 'Unknown scope.')
    const resource = single(params, 'resource')
    if (!this.sameResource(resource))
      return back('invalid_target', 'Unknown resource.')
    const pending: Pending = {
      clientId: clientId!,
      redirectUri,
      state,
      codeChallenge,
      scope,
      resource: this.resource,
    }
    return this.options.google.start('mcp', JSON.stringify(pending))
  }

  /** A 303 back to the client with `values` in the query and the issuer
   * (RFC 9207). */
  private toClient(
    redirectUri: string,
    values: Record<string, string | undefined>,
    cookies: string[] = [],
  ) {
    const target = new URL(redirectUri)
    for (const [name, value] of Object.entries({
      ...values,
      iss: this.options.origin,
    }))
      if (value !== undefined) target.searchParams.set(name, value)
    const headers = new Headers({
      location: target.href,
      'cache-control': 'no-store',
    })
    for (const cookie of cookies) headers.append('set-cookie', cookie)
    return new Response(null, { status: 303, headers })
  }

  /** The Google callback of an `/oauth/authorize`: the Dono gate, then our
   * own code to the client. `clear` forgets the Google attempt. */
  resume(email: string, payload: string, clear: string): Response {
    const pending = JSON.parse(payload) as Pending
    const owner = this.options.owners.ownerByEmail(email)
    if (!owner)
      return this.toClient(
        pending.redirectUri,
        {
          error: 'access_denied',
          error_description: 'This Google account is not a Dono of filmes.',
          state: pending.state,
        },
        [clear],
      )
    const code = random()
    const now = this.options.now()
    this.db((db) => {
      db.prepare('DELETE FROM oauth_codes WHERE expires_at <= ?').run(now)
      db.prepare('INSERT INTO oauth_codes VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
        hash(code),
        pending.clientId,
        pending.redirectUri,
        pending.codeChallenge,
        pending.scope,
        pending.resource,
        owner.email,
        now + CODE_MS,
      )
    })
    return this.toClient(pending.redirectUri, { code, state: pending.state }, [
      clear,
    ])
  }

  /** The form of a token or revocation request, or the error to answer. */
  private async form(request: Request) {
    const type = request.headers.get('content-type') ?? ''
    if (!type.toLowerCase().startsWith('application/x-www-form-urlencoded'))
      return oauthError('invalid_request', 'The body must be form-encoded.')
    const text = await readBody(request)
    if (text === null)
      return oauthError('invalid_request', 'The body is too big.')
    return new URLSearchParams(text)
  }

  private async token(request: Request) {
    const form = await this.form(request)
    if (form instanceof Response) return form
    const grantType = single(form, 'grant_type')
    if (grantType === 'authorization_code') return this.exchange(form)
    if (grantType === 'refresh_token') return this.refresh(form)
    return oauthError(
      'unsupported_grant_type',
      'Only authorization_code and refresh_token.',
    )
  }

  private exchange(form: URLSearchParams) {
    const code = single(form, 'code')
    const verifier = single(form, 'code_verifier')
    const clientId = single(form, 'client_id')
    const redirectUri = single(form, 'redirect_uri')
    if (!code || !clientId)
      return oauthError('invalid_request', 'code and client_id are required.')
    // Consumed before any check, so a second use finds nothing.
    const row = this.db((db) =>
      db
        .prepare('DELETE FROM oauth_codes WHERE code_hash = ? RETURNING *')
        .get(hash(code)),
    )
    const dead = () =>
      oauthError('invalid_grant', 'The code is invalid or expired.')
    if (!row || Number(row.expires_at) <= this.options.now()) return dead()
    if (row.client_id !== clientId) return dead()
    if (redirectUri !== undefined && redirectUri !== row.redirect_uri)
      return oauthError('invalid_grant', 'redirect_uri does not match.')
    if (
      !verifier ||
      !VERIFIER.test(verifier) ||
      !sameHash(hash(verifier), String(row.code_challenge))
    )
      return oauthError('invalid_grant', 'The PKCE verifier does not match.')
    if (!this.sameResource(single(form, 'resource')))
      return oauthError('invalid_target', 'Unknown resource.')
    if (!this.options.owners.ownerByEmail(String(row.email))) return dead()
    const grantId = random()
    return this.db((db) => {
      db.prepare('INSERT INTO oauth_grants VALUES (?, ?, ?, ?, ?, ?)').run(
        grantId,
        clientId,
        String(row.email),
        String(row.scope),
        String(row.resource),
        this.options.now(),
      )
      return this.issue(db, grantId, String(row.scope))
    })
  }

  /** New access and refresh tokens for the grant, in one answer. */
  private issue(db: DatabaseSync, grantId: string, scope: string) {
    const access = random()
    const refresh = random()
    const now = this.options.now()
    db.prepare('DELETE FROM oauth_tokens WHERE expires_at <= ?').run(now)
    const insert = db.prepare('INSERT INTO oauth_tokens VALUES (?, ?, ?, ?)')
    insert.run(hash(access), grantId, 'access', now + ACCESS_SECONDS * 1000)
    insert.run(hash(refresh), grantId, 'refresh', now + REFRESH_MS)
    return json({
      access_token: access,
      token_type: 'Bearer',
      expires_in: ACCESS_SECONDS,
      refresh_token: refresh,
      scope,
    })
  }

  /** Rotation: the refresh token is spent on use, the grant's old access
   * tokens go, and the answer brings the new pair. */
  private refresh(form: URLSearchParams) {
    const token = single(form, 'refresh_token')
    const clientId = single(form, 'client_id')
    if (!token || !clientId)
      return oauthError(
        'invalid_request',
        'refresh_token and client_id are required.',
      )
    const dead = () =>
      oauthError('invalid_grant', 'The refresh token is invalid or expired.')
    return this.db((db) => {
      db.exec('BEGIN IMMEDIATE')
      try {
        const answer = this.rotate(
          db,
          token,
          clientId,
          single(form, 'scope'),
          single(form, 'resource'),
          dead,
        )
        db.exec('COMMIT')
        return answer
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    })
  }

  private rotate(
    db: DatabaseSync,
    token: string,
    clientId: string,
    scope: string | undefined,
    resource: string | undefined,
    dead: () => Response,
  ) {
    const row = db
      .prepare(
        `DELETE FROM oauth_tokens WHERE token_hash = ? AND kind = 'refresh'
          RETURNING grant_id, expires_at`,
      )
      .get(hash(token))
    if (!row || Number(row.expires_at) <= this.options.now()) return dead()
    const grant = db
      .prepare('SELECT * FROM oauth_grants WHERE grant_id = ?')
      .get(row.grant_id)
    if (!grant || grant.client_id !== clientId) return dead()
    if (!this.options.owners.ownerByEmail(String(grant.email))) {
      db.prepare('DELETE FROM oauth_grants WHERE grant_id = ?').run(
        row.grant_id,
      )
      return dead()
    }
    const granted = new Set(String(grant.scope).split(' '))
    const asked = scope?.split(' ').filter(Boolean) ?? []
    if (!asked.every((s) => granted.has(s)))
      return oauthError('invalid_scope', 'The scope is wider than the grant.')
    if (!this.sameResource(resource))
      return oauthError('invalid_target', 'Unknown resource.')
    db.prepare(
      `DELETE FROM oauth_tokens WHERE grant_id = ? AND kind = 'access'`,
    ).run(row.grant_id)
    return this.issue(db, String(row.grant_id), String(grant.scope))
  }

  /** RFC 7009: the grant of the token ends, access and refresh. An unknown
   * token is still a 200. */
  private async revoke(request: Request) {
    const form = await this.form(request)
    if (form instanceof Response) return form
    const token = single(form, 'token')
    if (!token) return oauthError('invalid_request', 'token is required.')
    const clientId = single(form, 'client_id')
    this.db((db) =>
      db
        .prepare(
          `DELETE FROM oauth_grants WHERE grant_id =
            (SELECT grant_id FROM oauth_tokens WHERE token_hash = ?)
            AND (? IS NULL OR client_id = ?)`,
        )
        .run(hash(token), clientId ?? null, clientId ?? null),
    )
    return new Response(null, { status: 200, headers: noStore })
  }

  /** The SDK's token check (`requireBearerAuth` in `mcp-endpoint.ts`): a live access token whose
   * email is still on a Dono. The Owner rides in `extra.owner`. */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const row = this.db((db) =>
      db
        .prepare(
          `SELECT g.client_id, g.email, g.scope, g.resource, t.expires_at, c.redirect_uris
              FROM oauth_tokens t JOIN oauth_grants g USING (grant_id)
              JOIN oauth_clients c USING (client_id)
              WHERE t.token_hash = ? AND t.kind = 'access' AND t.expires_at > ?`,
        )
        .get(hash(token), this.options.now()),
    )
    const owner = row
      ? this.options.owners.ownerByEmail(String(row.email))
      : null
    if (!row || !owner)
      throw new OAuthError(
        OAuthErrorCode.InvalidToken,
        'The token is invalid or expired.',
      )
    return {
      token,
      clientId: String(row.client_id),
      scopes: String(row.scope).split(' '),
      expiresAt: Math.floor(Number(row.expires_at) / 1000),
      resource: new URL(String(row.resource)),
      extra: {
        owner,
        chatgpt: (JSON.parse(String(row.redirect_uris)) as string[]).includes(
          CHATGPT_CALLBACK,
        ),
      },
    }
  }
}

/** The slug of the Dono `verifyAccessToken` put on a verified token. */
export const ownerOf = (authInfo: AuthInfo | undefined): string | null =>
  (authInfo?.extra?.owner as Owner | undefined)?.person ?? null

/** Whether that Dono has `admin: true` (read with her on every request). */
export const adminOf = (authInfo: AuthInfo | undefined): boolean =>
  (authInfo?.extra?.owner as Owner | undefined)?.admin === true
