// The connector as claude.ai sees it: discovery from the `401`, dynamic
// registration, the authorization code with PKCE through the Google login
// (a stand-in `fetch`), the token, a tool call over Streamable HTTP with the
// bearer, and refresh with rotation. The client side is the MCP SDK's own
// OAuth and transport code, on the real engine over a copy of the fixture.

import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeEngine } from '@filmes/engine'
import {
  Client,
  discoverOAuthServerInfo,
  exchangeAuthorization,
  refreshAuthorization,
  registerClient,
  startAuthorization,
  StreamableHTTPClientTransport,
  type OAuthClientInformationFull,
  type OAuthServerInfo,
} from '@modelcontextprotocol/client'
import { describe, expect, it, onTestFinished } from 'vite-plus/test'
import {
  useFixture,
  type Fixture,
} from '../../../packages/engine/test/fixture.ts'
import type { McpHttpHandler } from '@modelcontextprotocol/server'
import { Auth } from './auth'
import { mcpHandler, mcpRequest } from './mcp-endpoint'

const ORIGIN = 'http://localhost:3000'
const SERVER = `${ORIGIN}/mcp`
const CALLBACK = 'http://127.0.0.1:43123/callback'

/** A JSON answer's fields. */
const json = async (response: Response) =>
  (await response.json()) as Record<string, unknown>

/** The JSON of a tool's one text block. */
const toolOutput = (result: unknown) =>
  JSON.parse(
    (result as { content: Array<{ text: string }> }).content[0]!.text,
  ) as Record<string, unknown>

/** Claude's state for one connection, as the SDK's helpers need it. */
type Connection = {
  info: OAuthServerInfo
  client: OAuthClientInformationFull
}

/** The app's connector paths over a fixture copy, and Claude's side. */
class Connector {
  email = 'bruno@example.org'
  /** The Donos' emails (the login's gate, `owners.ts`, is tested there). */
  readonly donos = new Set(['bruno@example.org'])
  readonly admins = new Set<string>()
  readonly auth: Auth
  readonly handler: McpHttpHandler

  constructor(fixture: Fixture) {
    const engine = makeEngine(fixture.vars)
    this.handler = mcpHandler(() => engine)
    onTestFinished(async () => {
      await this.handler.close()
      await engine.dispose()
    })
    this.auth = new Auth({
      origin: ORIGIN,
      clientId: 'client',
      clientSecret: 'secret',
      databasePath: join(
        mkdtempSync(join(tmpdir(), 'mcp-auth-')),
        'auth.sqlite',
      ),
      owners: {
        ownerByEmail: (email) =>
          this.donos.has(email)
            ? {
                person: email.split('@')[0]!,
                name: '',
                email,
                admin: this.admins.has(email),
              }
            : null,
      },
      endpoints: {
        authorize: 'https://google.test/authorize',
        token: 'https://google.test/token',
        userinfo: 'https://google.test/userinfo',
      },
      fetch: (async (input: RequestInfo | URL) =>
        (input instanceof Request ? input.url : input.toString()).endsWith(
          '/token',
        )
          ? Response.json({ access_token: 'google-token' })
          : Response.json({
              email: this.email,
              email_verified: true,
            })) as typeof fetch,
    })
  }

  /** The app: login, connector, then a 404 for the rest. */
  readonly fetchFn = async (url: string | URL, init?: RequestInit) => {
    const request = new Request(url, init)
    return (
      (await this.auth.handle(request)) ??
      (await mcpRequest(request, this.auth, this.handler)) ??
      new Response('app', { status: 404 })
    )
  }

  /** The browser: from the authorization URL through Google back to the
   * client's redirect. */
  async browse(authorizationUrl: URL) {
    const start = await this.fetchFn(authorizationUrl)
    const atGoogle = new URL(start.headers.get('location')!)
    assert.equal(atGoogle.origin, 'https://google.test')
    const cookie = start.headers.get('set-cookie')!.split(';')[0]!
    const state = atGoogle.searchParams.get('state')
    const back = await this.fetchFn(
      `${ORIGIN}/auth/callback?state=${state}&code=g`,
      { headers: { cookie } },
    )
    return new URL(back.headers.get('location')!)
  }

  /** Discovery and registration, as Claude does them. */
  async register(): Promise<Connection> {
    const info = await discoverOAuthServerInfo(SERVER, {
      fetchFn: this.fetchFn,
    })
    const client = await registerClient(info.authorizationServerUrl, {
      metadata: info.authorizationServerMetadata,
      clientMetadata: {
        client_name: 'Claude',
        redirect_uris: [CALLBACK],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
      },
      fetchFn: this.fetchFn,
    })
    return { info, client }
  }

  /** Up to the client's redirect, logged in to Google as `email`. */
  async authorize(email: string) {
    this.email = email
    const connection = await this.register()
    const { authorizationUrl, codeVerifier } = await startAuthorization(
      connection.info.authorizationServerUrl,
      {
        metadata: connection.info.authorizationServerMetadata,
        clientInformation: connection.client,
        redirectUrl: CALLBACK,
        scope: 'mcp offline_access',
        state: 'claude-state',
        resource: SERVER,
      },
    )
    return {
      ...connection,
      codeVerifier,
      back: await this.browse(authorizationUrl),
    }
  }

  /** The whole flow, to the tokens. */
  async tokens(email: string) {
    const { info, client, codeVerifier, back } = await this.authorize(email)
    assert.equal(back.origin + back.pathname, CALLBACK)
    assert.equal(back.searchParams.get('state'), 'claude-state')
    const tokens = await exchangeAuthorization(info.authorizationServerUrl, {
      metadata: info.authorizationServerMetadata,
      clientInformation: client,
      authorizationCode: back.searchParams.get('code')!,
      iss: back.searchParams.get('iss')!,
      codeVerifier,
      redirectUri: CALLBACK,
      resource: SERVER,
      fetchFn: this.fetchFn,
    })
    return { info, client, tokens }
  }

  refresh({ info, client }: Connection, refreshToken: string) {
    return refreshAuthorization(info.authorizationServerUrl, {
      metadata: info.authorizationServerMetadata,
      clientInformation: client,
      refreshToken,
      resource: SERVER,
      fetchFn: this.fetchFn,
    })
  }

  /** An MCP client over HTTP with the bearer. */
  async mcp(accessToken: string) {
    const client = new Client({ name: 'claude-test', version: '0' })
    await client.connect(
      new StreamableHTTPClientTransport(new URL(SERVER), {
        fetch: this.fetchFn,
        requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
      }),
    )
    onTestFinished(() => client.close())
    return client
  }

  /** A raw `tools/list` with `accessToken`: its HTTP status. */
  async status(accessToken: string) {
    const response = await this.fetchFn(SERVER, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
    return response.status
  }
}

describe('discovery', () => {
  it('answers an unauthenticated call with the 401 that leads to the metadata', async () => {
    const { fetchFn } = new Connector(useFixture())
    const response = await fetchFn(SERVER, { method: 'POST', body: '{}' })
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain(
      `resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource"`,
    )
    for (const path of ['', '/mcp'])
      expect(
        await json(
          await fetchFn(
            `${ORIGIN}/.well-known/oauth-protected-resource${path}`,
          ),
        ),
      ).toMatchObject({ resource: SERVER, authorization_servers: [ORIGIN] })
  })

  it('advertises PKCE S256, public clients and no CIMD', async () => {
    const { fetchFn } = new Connector(useFixture())
    const metadata = await json(
      await fetchFn(`${ORIGIN}/.well-known/oauth-authorization-server`),
    )
    expect(metadata).toMatchObject({
      issuer: ORIGIN,
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
    })
    expect(metadata).not.toHaveProperty('client_id_metadata_document_supported')
  })
})

describe('a tool call with the token', () => {
  it('runs as the Pessoa the token belongs to', async () => {
    const connector = new Connector(useFixture())
    // Iara becomes a second Dono, so the Owner cannot be the default one.
    connector.donos.add('iara@example.org')
    const { tokens } = await connector.tokens('iara@example.org')
    expect(tokens).toMatchObject({
      token_type: 'Bearer',
      scope: 'mcp offline_access',
    })
    const client = await connector.mcp(tokens.access_token)
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name)).toContain('recommend')
    const result = await client.callTool({
      name: 'recommend',
      arguments: { attendees: ['dono'] },
    })
    expect(toolOutput(result).attendees).toEqual(['iara'])
  })

  it('stops once the Pessoa is no longer Dono', async () => {
    const connector = new Connector(useFixture())
    const { tokens } = await connector.tokens('bruno@example.org')
    expect(await connector.status(tokens.access_token)).toBe(200)
    connector.donos.delete('bruno@example.org')
    expect(await connector.status(tokens.access_token)).toBe(401)
  })
})

describe('the admin tools', () => {
  it('a non-admin token neither lists nor calls consult and evaluate', async () => {
    const connector = new Connector(useFixture())
    const { tokens } = await connector.tokens('bruno@example.org')
    const client = await connector.mcp(tokens.access_token)

    const names = (await client.listTools()).tools.map((tool) => tool.name)

    expect(names).toContain('person')
    expect(names).not.toContain('consult')
    expect(names).not.toContain('evaluate')
    await expect(
      client.callTool({ name: 'consult', arguments: { sql: 'SELECT 1' } }),
    ).rejects.toThrow(/consult not found/)
  })

  it('an admin token lists and calls them', async () => {
    const connector = new Connector(useFixture())
    connector.admins.add('bruno@example.org')
    const { tokens } = await connector.tokens('bruno@example.org')
    const client = await connector.mcp(tokens.access_token)

    const names = (await client.listTools()).tools.map((tool) => tool.name)
    const result = await client.callTool({
      name: 'consult',
      arguments: { sql: 'SELECT 1 AS n' },
    })

    expect(names).toEqual(expect.arrayContaining(['consult', 'evaluate']))
    expect(toolOutput(result)).toEqual({ columns: ['n'], rows: [[1]] })
  })
})

describe('refresh', () => {
  it('rotates the tokens and refuses the spent refresh token', async () => {
    const connector = new Connector(useFixture())
    const { tokens, ...connection } =
      await connector.tokens('bruno@example.org')
    const next = await connector.refresh(connection, tokens.refresh_token!)
    expect(next.refresh_token).not.toBe(tokens.refresh_token)
    await expect(
      connector.refresh(connection, tokens.refresh_token!),
    ).rejects.toThrow(/invalid or expired/)
    expect(await connector.status(tokens.access_token)).toBe(401)
    const result = await (
      await connector.mcp(next.access_token)
    ).callTool({
      name: 'open_sessions',
      arguments: {},
    })
    expect(result.isError).toBeFalsy()
  })
})

describe('without the Google login', () => {
  it('stays off', async () => {
    const auth = new Auth({
      origin: ORIGIN,
      databasePath: join(
        mkdtempSync(join(tmpdir(), 'mcp-off-')),
        'auth.sqlite',
      ),
      owners: { ownerByEmail: () => null },
    })
    const send = (path: string, init?: RequestInit) =>
      mcpRequest(new Request(`${ORIGIN}${path}`, init), auth, {} as never)
    expect((await send('/mcp', { method: 'POST' }))!.status).toBe(503)
    const metadata = await send('/.well-known/oauth-protected-resource')
    expect(metadata!.status).toBe(404)
    expect(await send('/oauth/register', { method: 'POST' })).toBeNull()
  })
})
