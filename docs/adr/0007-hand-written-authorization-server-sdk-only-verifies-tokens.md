# Hand-written OAuth authorization server; the MCP SDK only verifies tokens

claude.ai's custom connector reaches filmes at `<APP_ORIGIN>/mcp` over Streamable HTTP and signs in with OAuth: discovery from a `401`, dynamic client registration, the authorization code with PKCE, and refresh (#75). The MCP TypeScript SDK v2 (`@modelcontextprotocol/server` 2.4.0, the line MCP Apps 2.x needs) dropped its authorization-server helpers: they survive only as a frozen Express copy in `server-legacy`, due to go in v3. The SDK's advice is a dedicated identity provider.

## Decision

- **The SDK does the resource server's half and nothing else.** `frontend/src/platform/mcp-endpoint.ts` uses `requireBearerAuth` (the bearer check, `expectedResource`, the `401` with `WWW-Authenticate: Bearer resource_metadata=…`), `buildOAuthProtectedResourceMetadata` (RFC 9728, served at `/.well-known/oauth-protected-resource` and its `/mcp` path form) and `createMcpHandler`, whose factory builds the server of `packages/mcp-server` for the Pessoa the token belongs to.
- **The authorization server is hand-written** in `frontend/src/platform/oauth-server.ts`, next to the Google login it reuses: `/.well-known/oauth-authorization-server` (RFC 8414), `/oauth/register` (RFC 7591, public clients only), `/oauth/authorize` (code with PKCE S256 only), `/oauth/token` (code exchange; refresh with rotation, `invalid_grant` for a dead token) and `/oauth/revoke` (RFC 7009). It advertises no CIMD: Claude falls back to DCR.
- **The login is the web login.** `/oauth/authorize` checks the client, the redirect and PKCE, then starts the Google flow of `google-login.ts` with the purpose `mcp`; Google comes back to the shared `/auth/callback`, where the same Dono gate decides. Our own code goes to the client; Google's tokens never leave the server.
- **Redirects are an allowlist**: `https://claude.ai/api/mcp/auth_callback` (and the same path on `claude.com`) and loopback `http://localhost|127.0.0.1|[::1]` on any port (Claude Code, RFC 8252). Registration refuses anything else, so a code can only go to Claude or to the machine of whoever is logging in.
- **Everything lives in `auth.sqlite`**, as new migrations: clients, codes, grants and tokens, every code and token stored by its SHA-256. A grant keeps the email, not the Pessoa, and the Dono gate runs again on each refresh and each MCP request: a Pessoa who stops being Dono loses the connector at once. Access tokens last 1 hour, refresh tokens 90 days, codes 5 minutes; a client with no grant is forgotten after a day.

## Why

Of the three ways #75 left open, the hand-written server is the smallest: about 400 lines over the database and the Google flow filmes already has, for two users and one client (Claude). The deprecated SDK copy needs Express and dies in v3. A vetted OAuth library still needs its storage, login and consent wired to ours, and none fits TanStack Start's `fetch` handler without an adapter. A dedicated IdP (Keycloak, Auth0) is a service the VPS does not run and a second login for the Pessoas.

## Consequences

- The OAuth code is ours to keep correct: `oauth-server.test.ts` covers each refusal, `mcp-endpoint.test.ts` runs the whole flow with the SDK's own client functions, and `e2e/mcp.e2e.ts` runs it on the built server against the stand-in Google.
- There is no consent screen: Google's account chooser is the only page the Dono sees. The redirect allowlist is what keeps a code from going elsewhere.
- A new client (another host than Claude) needs its redirect added to the allowlist.
- Rotation spends the refresh token on any answer, refusals included; a client that loses the answer starts over with a new login.
