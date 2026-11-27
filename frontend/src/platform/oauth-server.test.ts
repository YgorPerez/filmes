// The authorization server's refusals, request by request: what a client
// gets wrong (registration, authorize, token, revoke) and what an attacker
// could try (another redirect, a code twice, a code without its verifier).
// The happy path, with the SDK's client, is `mcp-endpoint.test.ts`.

import { createHash, randomBytes } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { openAuthDatabase } from './auth-database'
import { GoogleLogin } from './google-login'
import { allowedRedirect, OAuthServer } from './oauth-server'

const ORIGIN = 'https://cinema.example'
const CLAUDE = 'https://claude.ai/api/mcp/auth_callback'
const CHATGPT = 'https://chatgpt.com/connector_platform_oauth_redirect'

/** A JSON answer's fields. */
const json = async (response: Response | null) =>
  (await response!.json()) as Record<string, string>

/** The OAuth `error` of a 400. */
const error = async (response: Response | null) => {
  expect(response!.status).toBe(400)
  return (await json(response)).error
}

const location = (response: Response | null) =>
  new URL(response!.headers.get('location')!)

/** The authorization server on a fresh `auth.sqlite`, with a clock, the
 * Donos' emails and a Google that signs `email` in. */
class Server {
  clock = Date.now()
  email = 'bruno@example.org'
  readonly donos = new Set(['bruno@example.org'])
  readonly verifier = randomBytes(32).toString('base64url')
  readonly google: GoogleLogin
  readonly oauth: OAuthServer

  constructor() {
    const path = join(mkdtempSync(join(tmpdir(), 'oauth-')), 'auth.sqlite')
    const database = () => openAuthDatabase(path)
    const now = () => this.clock
    this.google = new GoogleLogin({
      database,
      clientId: 'client',
      clientSecret: 'secret',
      redirectUri: `${ORIGIN}/auth/callback`,
      secure: true,
      endpoints: {
        authorize: 'https://google.test/authorize',
        token: 'https://google.test/token',
        userinfo: 'https://google.test/userinfo',
      },
      fetch: (async (input: RequestInfo | URL) =>
        (input instanceof Request ? input.url : input.toString()).endsWith(
          '/token',
        )
          ? Response.json({ access_token: 'g' })
          : Response.json({
              email: this.email,
              email_verified: true,
            })) as typeof fetch,
      now,
    })
    this.oauth = new OAuthServer({
      origin: ORIGIN,
      google: this.google,
      database,
      owners: {
        ownerByEmail: (email) =>
          this.donos.has(email)
            ? { person: email.split('@')[0]!, email }
            : null,
      },
      now,
    })
  }

  send(path: string, init: RequestInit = {}) {
    return this.oauth.handle(new Request(`${ORIGIN}${path}`, init))
  }

  post(path: string, body: Record<string, string>) {
    return this.send(path, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    })
  }

  async register(body: unknown) {
    return (await this.send('/oauth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }))!
  }

  async clientId(redirect = CLAUDE) {
    return (await json(await this.register({ redirect_uris: [redirect] })))
      .client_id!
  }

  authorize(clientId: string, extra: Record<string, string> = {}) {
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: CLAUDE,
      code_challenge: createHash('sha256')
        .update(this.verifier)
        .digest('base64url'),
      code_challenge_method: 'S256',
      state: 's',
      ...extra,
    })
    for (const [name, value] of Object.entries(extra))
      if (value === '') query.delete(name)
    return this.send(`/oauth/authorize?${query}`)
  }

  /** Google's callback, as `auth.ts` hands it to `resume`. */
  async callback(start: Response | null) {
    const state = location(start).searchParams.get('state')
    const cookie = start!.headers.get('set-cookie')!.split(';')[0]!
    const result = await this.google.finish(
      new Request(`${ORIGIN}/auth/callback?state=${state}&code=g`, {
        headers: { cookie },
      }),
    )
    if (!result.ok) throw new Error(result.reason)
    return location(this.oauth.resume(result.email, result.payload, 'clear'))
  }

  /** A registered client with a code from Bruno's login. */
  async code() {
    const clientId = await this.clientId()
    const back = await this.callback(await this.authorize(clientId))
    return { clientId, code: back.searchParams.get('code')!, back }
  }

  exchange(values: Record<string, string>) {
    return this.post('/oauth/token', {
      grant_type: 'authorization_code',
      code_verifier: this.verifier,
      ...values,
    })
  }

  /** Tokens for a new grant. */
  async tokens() {
    const { clientId, code } = await this.code()
    const tokens = await json(
      await this.exchange({ code, client_id: clientId }),
    )
    return { ...tokens, clientId } as Record<string, string>
  }
}

describe('the allowed redirects', () => {
  it('takes the Claude callback and loopback ones, nothing else', () => {
    for (const uri of [
      CLAUDE,
      'http://localhost:5555/callback',
      'http://127.0.0.1:1/callback',
    ])
      expect(allowedRedirect(uri)).toBe(true)
    for (const uri of [
      'https://claude.ai/other',
      'https://evil.example/api/mcp/auth_callback',
      'http://localhost.evil.example/callback',
      'http://user@localhost:1/callback',
      'not a url',
    ])
      expect(allowedRedirect(uri)).toBe(false)
  })
})

describe('registration', () => {
  it('registers a public client whatever it asked for', async () => {
    const response = await new Server().register({
      client_name: 'Claude',
      redirect_uris: [CLAUDE],
      token_endpoint_auth_method: 'client_secret_post',
    })
    expect(response.status).toBe(201)
    const client = await json(response)
    expect(client).toMatchObject({
      client_name: 'Claude',
      redirect_uris: [CLAUDE],
      token_endpoint_auth_method: 'none',
    })
    expect(client).not.toHaveProperty('client_secret')
  })

  it('accepts only the exact HTTPS callback for ChatGPT', async () => {
    const server = new Server()
    const registered = await server.register({ redirect_uris: [CHATGPT] })
    expect(registered.status).toBe(201)
    const client = await json(registered)
    const metadata = await json(
      await server.send('/.well-known/oauth-authorization-server'),
    )
    const authorize = (redirect: string, extra: Record<string, string> = {}) =>
      server.authorize(client.client_id!, { redirect_uri: redirect, ...extra })
    const back = await server.callback(await authorize(CHATGPT))
    expect(back.origin + back.pathname).toBe(CHATGPT)
    expect(back.searchParams.get('iss')).toBe(metadata.issuer)
    const refused = location(await authorize(CHATGPT, { scope: 'admin' }))
    expect(refused.searchParams.get('error')).toBe('invalid_scope')
    expect(refused.searchParams.get('iss')).toBe(metadata.issuer)

    for (const redirect of [
      CHATGPT + '/',
      CHATGPT + '?other=1',
      CHATGPT + '#fragment',
      CHATGPT.replace('https:', 'http:'),
      CHATGPT.replace('chatgpt.com', 'chatgpt.com.example'),
    ]) {
      expect(
        await error(await server.register({ redirect_uris: [redirect] })),
      ).toBe('invalid_redirect_uri')
      const response = (await authorize(redirect))!
      expect(response.status).toBe(400)
      expect(response.headers.has('location')).toBe(false)
    }
  })

  it('refuses another redirect, or none', async () => {
    const server = new Server()
    for (const body of [
      { redirect_uris: ['https://evil.example/cb'] },
      { redirect_uris: [] },
      {},
    ])
      expect(await error(await server.register(body))).toBe(
        'invalid_redirect_uri',
      )
  })

  it('refuses a bad grant or a body that is not a JSON object', async () => {
    const server = new Server()
    const grant = { redirect_uris: [CLAUDE], grant_types: ['implicit'] }
    expect(await error(await server.register(grant))).toBe(
      'invalid_client_metadata',
    )
    expect(await error(await server.register([CLAUDE]))).toBe(
      'invalid_client_metadata',
    )
    for (const body of ['{', 'x'.repeat(20_000)])
      expect(
        await error(
          await server.send('/oauth/register', { method: 'POST', body }),
        ),
      ).toBe('invalid_client_metadata')
  })

  it.each([CLAUDE, CHATGPT])(
    'prunes an unused client after a day (%s)',
    async (redirect) => {
      const server = new Server()
      const old = await server.clientId(redirect)
      server.clock += 23 * 60 * 60_000
      await server.clientId()
      expect(
        location(await server.authorize(old, { redirect_uri: redirect }))
          .origin,
      ).toBe('https://google.test')
      server.clock += 2 * 60 * 60_000
      await server.clientId()
      const response = (await server.authorize(old, {
        redirect_uri: redirect,
      }))!
      expect(response.status).toBe(400)
      expect(await response.text()).toContain('não está registrado')
    },
  )
})

describe('authorize, before the redirect is known', () => {
  it('never redirects for an unknown client or a redirect it did not register', async () => {
    const server = new Server()
    expect((await server.authorize('nobody'))!.status).toBe(400)
    const id = await server.clientId()
    const elsewhere = (await server.authorize(id, {
      redirect_uri: 'http://localhost:1/cb',
    }))!
    expect(elsewhere.status).toBe(400)
    expect(elsewhere.headers.get('location')).toBeNull()
    const repeated = (await server.send(
      `/oauth/authorize?client_id=${id}&client_id=${id}`,
    ))!
    expect(repeated.status).toBe(400)
  })

  it('takes the one registered redirect when the client names none', async () => {
    const server = new Server()
    const id = await server.clientId()
    const toGoogle = await server.authorize(id, { redirect_uri: '' })
    expect(location(toGoogle).origin).toBe('https://google.test')
  })

  it('takes a loopback redirect on another port', async () => {
    const server = new Server()
    const id = await server.clientId('http://127.0.0.1:1000/callback')
    const other = await server.authorize(id, {
      redirect_uri: 'http://127.0.0.1:2000/callback',
    })
    expect(location(other).origin).toBe('https://google.test')
  })
})

describe('authorize, once the redirect is known', () => {
  it('answers the client for a bad request', async () => {
    const server = new Server()
    const id = await server.clientId()
    const refusal = async (extra: Record<string, string>) => {
      const response = await server.authorize(id, extra)
      expect(response!.status).toBe(303)
      const back = location(response)
      expect(back.origin + back.pathname).toBe(CLAUDE)
      expect(back.searchParams.get('state')).toBe('s')
      return back.searchParams.get('error')
    }
    expect(await refusal({ code_challenge_method: 'plain' })).toBe(
      'invalid_request',
    )
    expect(await refusal({ code_challenge: 'short' })).toBe('invalid_request')
    expect(await refusal({ response_type: 'token' })).toBe(
      'unsupported_response_type',
    )
    expect(await refusal({ scope: 'admin' })).toBe('invalid_scope')
    expect(await refusal({ resource: 'https://elsewhere.example/mcp' })).toBe(
      'invalid_target',
    )
  })
})

describe('the code', () => {
  it('goes back with the issuer and trades once', async () => {
    const server = new Server()
    const { clientId, code, back } = await server.code()
    expect(back.searchParams.get('iss')).toBe(ORIGIN)
    const ok = (await server.exchange({ code, client_id: clientId }))!
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toBe('no-store')
    expect(
      await error(await server.exchange({ code, client_id: clientId })),
    ).toBe('invalid_grant')
  })

  it('is spent by a try with the wrong verifier', async () => {
    const server = new Server()
    const { clientId, code } = await server.code()
    const wrong = { code, client_id: clientId, code_verifier: 'x'.repeat(43) }
    expect(await error(await server.exchange(wrong))).toBe('invalid_grant')
    expect(
      await error(await server.exchange({ code, client_id: clientId })),
    ).toBe('invalid_grant')
  })

  it('needs its own client and redirect', async () => {
    const server = new Server()
    const first = await server.code()
    expect(
      await error(
        await server.exchange({ code: first.code, client_id: 'other' }),
      ),
    ).toBe('invalid_grant')
    const second = await server.code()
    const redirect = 'http://localhost:1/x'
    expect(
      await error(
        await server.exchange({
          code: second.code,
          client_id: second.clientId,
          redirect_uri: redirect,
        }),
      ),
    ).toBe('invalid_grant')
  })

  it('expires after five minutes', async () => {
    const server = new Server()
    const { code, clientId } = await server.code()
    server.clock += 5 * 60_000 + 1
    expect(
      await error(await server.exchange({ code, client_id: clientId })),
    ).toBe('invalid_grant')
  })
})

describe('the token endpoint', () => {
  it('refuses JSON, an unknown grant and missing fields', async () => {
    const server = new Server()
    const asJson = await server.send('/oauth/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(await error(asJson)).toBe('invalid_request')
    const grant = { grant_type: 'client_credentials' }
    expect(await error(await server.post('/oauth/token', grant))).toBe(
      'unsupported_grant_type',
    )
    expect(await error(await server.exchange({}))).toBe('invalid_request')
    const refresh = { grant_type: 'refresh_token' }
    expect(await error(await server.post('/oauth/token', refresh))).toBe(
      'invalid_request',
    )
  })

  it('refuses an unknown refresh token and a foreign resource', async () => {
    const server = new Server()
    const unknown = {
      grant_type: 'refresh_token',
      refresh_token: 'x',
      client_id: 'y',
    }
    expect(await error(await server.post('/oauth/token', unknown))).toBe(
      'invalid_grant',
    )
    const { code, clientId } = await server.code()
    const resource = 'https://elsewhere.example/mcp'
    expect(
      await error(
        await server.exchange({ code, client_id: clientId, resource }),
      ),
    ).toBe('invalid_target')
  })

  it('refreshes for no wider scope, and a refusal spends the token', async () => {
    const server = new Server()
    const tokens = await server.tokens()
    const refresh = (extra: Record<string, string>) =>
      server.post('/oauth/token', {
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token!,
        client_id: tokens.clientId,
        ...extra,
      })
    expect(await error(await refresh({ scope: 'mcp offline_access' }))).toBe(
      'invalid_scope',
    )
    expect(await error(await refresh({}))).toBe('invalid_grant')
  })
})

describe('revoke', () => {
  it('ends the grant of a token', async () => {
    const server = new Server()
    const tokens = await server.tokens()
    const revoked = await server.post('/oauth/revoke', {
      token: tokens.refresh_token!,
      client_id: tokens.clientId,
    })
    expect(revoked!.status).toBe(200)
    await expect(
      server.oauth.verifyAccessToken(tokens.access_token!),
    ).rejects.toThrow(/invalid or expired/)
  })

  it('says 200 for an unknown token and 400 for none', async () => {
    const server = new Server()
    const unknown = await server.post('/oauth/revoke', { token: 'unknown' })
    expect(unknown!.status).toBe(200)
    expect(await error(await server.post('/oauth/revoke', {}))).toBe(
      'invalid_request',
    )
  })
})

describe('the routes', () => {
  it('answers a preflight and a wrong method, and leaves other paths to the app', async () => {
    const server = new Server()
    const preflight = await server.send('/oauth/token', { method: 'OPTIONS' })
    expect(preflight!.status).toBe(204)
    expect(preflight!.headers.get('access-control-allow-origin')).toBe('*')
    expect((await server.send('/oauth/token'))!.status).toBe(404)
    expect(await server.send('/sessoes')).toBeNull()
  })
})

describe('the Dono gate', () => {
  it('sends a Google account that is not a Dono back to the client refused', async () => {
    const server = new Server()
    server.email = 'iara@example.org'
    const back = await server.callback(
      await server.authorize(await server.clientId()),
    )
    expect(back.origin + back.pathname).toBe(CLAUDE)
    expect(back.searchParams.get('error')).toBe('access_denied')
    expect(back.searchParams.get('state')).toBe('s')
    expect(back.searchParams.has('code')).toBe(false)
  })

  it('refuses the code and the refresh once the Pessoa is no longer Dono', async () => {
    const server = new Server()
    const { clientId, code } = await server.code()
    const tokens = await server.tokens()
    server.donos.clear()
    expect(
      await error(await server.exchange({ code, client_id: clientId })),
    ).toBe('invalid_grant')
    const refresh = {
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token!,
      client_id: tokens.clientId!,
    }
    expect(await error(await server.post('/oauth/token', refresh))).toBe(
      'invalid_grant',
    )
  })
})
