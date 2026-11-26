// The MCP connector end to end, on the built server: a client registers,
// sends the browser through `/oauth/authorize` and the stand-in Google as
// Bruno, gets the code at its loopback redirect (Claude Code's kind), trades
// it for a token and calls a tool over Streamable HTTP with the bearer.
// The client is the MCP SDK's own OAuth and transport code.

import { createHash, randomBytes } from 'node:crypto'
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import { expect, test } from './server-test'

/** A JSON answer's fields. */
const json = async (response: Response | null) =>
  (await response!.json()) as Record<string, string>

const CALLBACK = 'http://127.0.0.1:43999/callback'

/** The first film `search_catalog` finds for `query`, a tool any Dono has. */
async function firstFilm(client: Client, query: string) {
  const found = await client.callTool({
    name: 'search_catalog',
    arguments: { query, kinds: ['film'] },
  })
  const [block] = found.content as Array<{ text: string }>
  return (JSON.parse(block!.text) as { films: Array<{ id: string }> }).films[0]
    ?.id
}

test('a client connects through Google and calls a tool with its token', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL!
  const unauthenticated = await fetch(`${origin}/mcp`, { method: 'POST' })
  expect(unauthenticated.status).toBe(401)
  expect(unauthenticated.headers.get('www-authenticate')).toContain(
    `${origin}/.well-known/oauth-protected-resource`,
  )
  const metadata = await json(
    await fetch(`${origin}/.well-known/oauth-authorization-server`),
  )

  const registered = await fetch(metadata.registration_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'e2e', redirect_uris: [CALLBACK] }),
  })
  expect(registered.status).toBe(201)
  const { client_id: clientId } = await json(registered)

  const verifier = randomBytes(32).toString('base64url')
  const authorize = new URL(metadata.authorization_endpoint)
  authorize.search = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: CALLBACK,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256',
    scope: 'mcp',
    state: 'e2e-state',
    resource: `${origin}/mcp`,
  }).toString()

  // The loopback redirect has no server: the test catches it.
  let back: URL | undefined
  await page.route(`${new URL(CALLBACK).origin}/**`, (route) => {
    back = new URL(route.request().url())
    return route.fulfill({ body: 'ok' })
  })
  await page.goto(authorize.href)
  await page.getByLabel('E-mail').fill('bruno@example.org')
  await page.getByRole('button', { name: 'Continuar' }).click()
  await expect.poll(() => back?.searchParams.get('state')).toBe('e2e-state')
  const code = back!.searchParams.get('code')!

  const token = await fetch(metadata.token_endpoint, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      redirect_uri: CALLBACK,
      code_verifier: verifier,
    }),
  })
  expect(token.status).toBe(200)
  const { access_token: accessToken } = await json(token)

  const client = new Client({ name: 'e2e', version: '0' })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
      requestInit: { headers: { authorization: `Bearer ${accessToken}` } },
    }),
  )
  try {
    // Read only: the other e2e files share this fixture copy.
    const result = await client.callTool({ name: 'open_sessions' })
    expect(result.isError).toBeFalsy()
    const [block] = result.content as Array<{ text: string }>
    expect(JSON.parse(block!.text)).toHaveProperty('sessions')
    expect(await firstFilm(client, 'cidade de vidro')).toBe('tt9000103')
  } finally {
    await client.close()
  }
})
