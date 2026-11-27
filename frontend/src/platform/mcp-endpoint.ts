// The MCP server of `packages/mcp-server` over Streamable HTTP at `/mcp`,
// the URL of claude.ai's custom connector (#120). The SDK does the resource
// server's half: the protected resource metadata (RFC 9728), the bearer
// check and the `401` whose `WWW-Authenticate` points Claude to the
// metadata. The tokens come from `oauth-server.ts`.
//
// Each request builds its own server for the Pessoa the token belongs to
// (`createMcpHandler`'s factory), and each tool call runs on the process's
// one engine as that Owner, in its own Run.

import { createMcpServer, TOOLS } from '@filmes/mcp-server'
import type { Engine } from '@filmes/engine'
import {
  buildOAuthProtectedResourceMetadata,
  createMcpHandler,
  requireBearerAuth,
  type McpHttpHandler,
} from '@modelcontextprotocol/server'
import { authFromEnvironment, type Auth } from './auth'
import { appEngine } from './engine'
import { adminOf, MCP_SCOPE, ownerOf, type OAuthServer } from './oauth-server'
import { serverEnv } from './server-env'

const METADATA_PATH = '/.well-known/oauth-protected-resource'

// The pilot includes the recommendation and Cartaz flow, plus the Session's
// Feedback, title lookup and Markdown fallback.
const SESSION_TOOLS = TOOLS.filter(({ name }) =>
  [
    'open_sessions',
    'recommend',
    'billboard',
    'answer_billboard',
    'verify_answer',
    'record_feedback',
    'search_catalog',
  ].includes(name),
)

const plain = (status: number, message: string) =>
  new Response(message, {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'text/plain; charset=utf-8',
    },
  })

/** The `/mcp` handler of the SDK over `engine`, one per process. */
export function mcpHandler(engine: () => Engine): McpHttpHandler {
  return createMcpHandler((ctx) => {
    const owner = ownerOf(ctx.authInfo)
    // `mcpRequest` passes a verified token on every request.
    if (!owner) throw new Error('MCP request without a verified owner')
    // A non-admin's server has no `consult` nor `evaluate` at all. The
    // Cartaz's view loads the fonts from the app's address.
    const { APP_ORIGIN } = serverEnv()
    return createMcpServer({
      engine: engine(),
      owner,
      admin: adminOf(ctx.authInfo),
      oauthScope: MCP_SCOPE,
      ...(ctx.authInfo?.extra?.chatgpt === true && { tools: SESSION_TOOLS }),
      ...(APP_ORIGIN && { appOrigin: APP_ORIGIN }),
    })
  })
}

/** RFC 9728, at the root and at the path-aware address the SDK's clients
 * try first (`/.well-known/oauth-protected-resource/mcp`). */
function protectedResource(oauth: OAuthServer) {
  const origin = new URL(oauth.resource).origin
  const document = buildOAuthProtectedResourceMetadata({
    oauthMetadata: oauth.metadata(),
    resourceServerUrl: new URL(oauth.resource),
    scopesSupported: [MCP_SCOPE],
    resourceName: 'filmes',
    // Only a local origin (the e2e) is http; the login refuses any other.
    dangerouslyAllowInsecureIssuerUrl: origin.startsWith('http://'),
  })
  return Response.json(document, {
    headers: {
      'cache-control': 'no-store',
      'access-control-allow-origin': '*',
    },
  })
}

/** The SDK's bearer check over the tokens of `oauth`: the `401` that
 * points to the metadata, or the verified token with its Owner. */
const bearer = (oauth: OAuthServer) =>
  requireBearerAuth({
    verifier: {
      verifyAccessToken: (token) => oauth.verifyAccessToken(token),
    },
    requiredScopes: [MCP_SCOPE],
    resourceMetadataUrl: `${new URL(oauth.resource).origin}${METADATA_PATH}`,
    expectedResource: new URL(oauth.resource),
  })

/** The answer for the connector's paths (`/mcp`, the OAuth ones and their
 * metadata), or null for any other. */
export async function mcpRequest(
  request: Request,
  auth: Auth,
  handler: McpHttpHandler,
): Promise<Response | null> {
  const { pathname } = new URL(request.url)
  const oauth = auth.oauth
  if (pathname === METADATA_PATH || pathname === `${METADATA_PATH}/mcp`)
    return oauth && request.method === 'GET'
      ? protectedResource(oauth)
      : plain(404, 'Página não encontrada.')
  if (pathname !== '/mcp') return oauth ? oauth.handle(request) : null
  if (!oauth) return plain(503, 'O conector do filmes ainda não está ligado.')
  const authInfo = await bearer(oauth)(request)
  if (authInfo instanceof Response) return authInfo
  return handler.fetch(request, { authInfo })
}

let handler: McpHttpHandler | undefined

/** `mcpRequest` with the app's Auth (`authFromEnvironment`) and engine. */
export const handleMcpRequest = (request: Request) =>
  mcpRequest(
    request,
    authFromEnvironment(),
    (handler ??= mcpHandler(appEngine)),
  )
