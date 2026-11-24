## Research result for #75 (map #72)

Checked on 2026-11-24 against the official docs and SDK repos linked below. No real-device test yet: the checklist for that is at the end.

| # | Assumption | Verdict |
|---|---|---|
| 1 | Free account, one custom remote connector, works on Android and iOS | **Holds** on the docs. Needs the device test |
| 2 | OAuth: DCR, PKCE, protected resource metadata, redirect URIs, "using the MCP SDK's auth pieces" | **Fails in part.** What Claude needs is clear, but the SDK's authorization-server pieces are deprecated in SDK v2 |
| 3 | MCP Apps on mobile, the Enviar button, CSP and a single file | **Holds, with caveats.** Mobile renders `ui://` views. Enviar does not send without the user's OK, unless they already agreed to the app's messages |
| 4 | Server `instructions` reach the model on claude.ai | **Unknown.** No official doc says so either way. The device test decides it |

### 1. Free plan, one custom connector, mobile: holds

- Custom connectors over remote MCP are available on Free, Pro, Max, Ultra, Team and Enterprise. "Free users are limited to one custom connector." ([support: custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp), [docs: add a connector by URL](https://claude.com/docs/connectors/custom/add-unlisted.md))
- Mobile: a connector added on the web "will be available to use the next time you log in to your account on Claude for iOS or Android". Installing connectors *on* mobile is in beta, and "Claude Desktop and web remain the primary path for custom connectors". ([support: use connectors](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities))
- Claude calls the server from Anthropic's cloud (egress `160.79.104.0/21`), never from the phone. So the server must be public HTTPS on port 443. `cinema.finalsend.com.br` behind Nginx fits.
- Transport: Streamable HTTP (legacy HTTP+SSE still accepted). ([docs: build a server](https://claude.com/docs/connectors/building/index.md))

**Changes to the map:** none. Add one setup step: the sister adds the connector **on claude.ai in a browser** (or Ygor does it with her logged in), not from the phone app. filmes then fills her only custom-connector slot.

### 2. OAuth: what Claude needs holds, but the SDK part of the plan fails

What Claude's client does today ([docs: authentication for connectors](https://claude.com/docs/connectors/building/authentication.md)):

- **Discovery:** an unauthenticated request must get **`401`** with `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource"`. Claude ignores that header on a 200. In the protected resource metadata (RFC 9728), `resource` must equal the connector URL exactly, path included (e.g. `https://cinema.finalsend.com.br/mcp`). Claude uses only the **first** entry of `authorization_servers`. The authorization server must serve RFC 8414 or OIDC metadata under `/.well-known/`.
- **Client registration:** **DCR (RFC 7591)** and **CIMD** are both supported by default. Claude uses CIMD only when the metadata advertises `"client_id_metadata_document_supported": true` **and** `"none"` in `token_endpoint_auth_methods_supported`. Otherwise it falls back to DCR. In the "Add custom connector" dialog, "Use Claude's published identity" (CIMD) is the recommended option, and Claude marks settings it can read from the server as **Detected**. DCR alone is enough. With DCR, Claude registers a new public client on every fresh connection, so expect rows to pile up in `auth.sqlite`.
- **PKCE:** `S256` on every authorization request. Advertise `"code_challenge_methods_supported": ["S256"]`.
- **Scopes:** taken from the `scope` in the 401 challenge, otherwise from `scopes_supported`. Claude adds `offline_access` if the AS lists it, to get a refresh token.
- **Redirect URIs:** claude.ai web, Desktop, **mobile** and Cowork all use exactly `https://claude.ai/api/mcp/auth_callback`. **Claude Code** uses a loopback redirect on a random port (`http://localhost:<port>/callback` and `http://127.0.0.1:<port>/callback`), declared in its own CIMD. Match those with the port ignored. This matters if Ygor also uses the remote connector from Claude Code.
- **Token endpoint:** accept `application/x-www-form-urlencoded` (`/register` is JSON). Return `invalid_grant` for a dead refresh token. Rotate refresh tokens for public clients, and return the new one in the same response. Claude refreshes on a 401 and up to 5 min before expiry.
- **Latency:** 10 s for discovery, registration and token endpoints, 30 s for refresh. A Google round trip inside `/token` must stay well under that.
- No `client_credentials` grant.

**The part that fails: "the MCP authorization side (DCR, PKCE, tokens) uses the MCP SDK's auth pieces".**

- In TypeScript SDK **v2** (`@modelcontextprotocol/server` 2.4.0, 2026-10-23), the authorization-server helpers (`mcpAuthRouter`, `ProxyOAuthServerProvider`, …) were removed. They survive only as a **frozen, deprecated copy** in `@modelcontextprotocol/server-legacy/auth`. That copy needs Express, gets no new features, and "is planned for removal in v3". The SDK's advice is to use a dedicated identity provider. ([server-legacy README](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/packages/server-legacy/README.md), [docs/serving/authorization.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/authorization.md))
- v2 keeps only the **resource-server half**: `requireBearerAuth` (web-standard `fetch` version in `@modelcontextprotocol/server`, which fits Nitro/TanStack Start), the protected-resource metadata helpers, and `requireScopes`.
- `@modelcontextprotocol/ext-apps` **2.1.0** (2026-11-10) peer-depends on `@modelcontextprotocol/server` / `core` / `client` **^2.0.0**. The 1.x line pairs with SDK v1 (1.32.2), which still ships `mcpAuthRouter`. Picking SDK v1 to keep the auth router would also pin MCP Apps to the old line.

**Changes to the map:**
- Replace "uses the MCP SDK's auth pieces" with: **SDK v2 for the resource-server half (`requireBearerAuth`, protected resource metadata); the authorization server (`/.well-known/oauth-authorization-server`, `/register`, `/authorize`, `/token`, PKCE S256 check, refresh rotation, optionally CIMD) is hand-written** next to the Google login and stored in `auth.sqlite`. The other options are a small vetted OAuth 2.1 server library, or a dedicated IdP, which would add a service the Infra section doesn't have. Each is a decision worth an ADR (#74).
- `/authorize` redirects to Google for login, checks the email against the Dono Pessoas, then issues our own code to `https://claude.ai/api/mcp/auth_callback`. Google tokens never reach Claude.
- Add the Claude Code loopback redirect to the allowed redirects if Ygor uses filmes from Claude Code.

### 3. MCP Apps: holds, with caveats

**Mobile renders `ui://` views.** Interactive connectors are "available for all users on Claude, Cowork, Claude Desktop, and Claude for iOS/Android". Only the side panel, full-site views and pinning are web/desktop only. ([support: interactive connectors](https://support.claude.com/en/articles/13454812-use-interactive-connectors-in-claude)) On mobile, Claude renders the app in a native WebView (`WKWebView` on iOS, `WebView` on Android). Inline cards are full width, and fullscreen fills the screen with the composer overlaid. ([docs: design guidelines](https://claude.com/docs/connectors/building/mcp-apps/design-guidelines.md), [docs: troubleshoot](https://claude.com/docs/connectors/building/mcp-apps/troubleshooting.md)) Custom connectors render MCP Apps: the quickstart's test path is "add it by URL" as a custom connector. ([docs: MCP Apps quickstart](https://claude.com/docs/connectors/building/mcp-apps/quickstart.md))

**Enviar (`app.sendMessage` → `ui/message`) works, but Claude asks the user first.** ([docs: send messages](https://claude.com/docs/connectors/building/mcp-apps/send-messages.md), [MCP Apps spec 2026-01-26](https://github.com/modelcontextprotocol/ext-apps/blob/main/specification/2026-01-26/apps.mdx))
- "Claude acts on a message only with the user's agreement. Unless the user has already agreed to your app's messages", Claude either **asks the user to allow the message** or **puts the text in the message box** for the user to send. It may show "Use caution before running this prompt." It never replaces a draft the user already has.
- A success result can come back before the user decides. Don't read it as "Claude regenerated".
- Limits: `role: "user"`, text blocks only, at most **8,000 characters**, at most 3 consecutive line breaks, no invisible characters. Send only on a user gesture, with no retries or timers.
- When the app reloads it "starts from your HTML". Ticked films live only in the view, so keep anything that must survive on the server.
- Also available: `ui/update-model-context` (quiet context the host may send with the next user message) and `app.callServerTool` (the view calls a server tool directly, with no model turn).

**What the HTML may load:**
- The resource is `text/html;profile=mcp-app`, one HTML5 document, as `text` or `blob`.
- Default CSP when `_meta.ui.csp` is omitted: `default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' data:; connect-src 'none'`. So a **single-file bundle with inline JS and CSS** works with no declaration. That makes the React Cartaz bundled into one HTML file (e.g. a Vite single-file build) the right shape.
- Anything external must be declared on the content item `resources/read` returns: `connectDomains` (fetch/XHR/WebSocket), `resourceDomains` (scripts, styles, **images, fonts**), `frameDomains`. Poster images from a CDN (e.g. `https://image.tmdb.org`) need `resourceDomains`. `font-src` never includes `data:` (the default falls back to `'none'`, the declared form is `'self'` plus `resourceDomains`), so `data:` fonts are blocked. Use the host font (`--font-sans` is Anthropic Sans) or declare a font origin.
- iOS WebKit omits `Referer` on cross-origin subresources. If Nginx or a CDN gates on Referer, allow by `Origin` (`*.claudemcpcontent.com`).
- Keep tool results under ~150,000 characters, or the view gets a file pointer instead of `structuredContent`.

**Mobile layout limits the Cartaz has to respect:** on mobile the conversation owns vertical scrolling. Inline height is capped and the overflow clipped, with no internal vertical scroll. Inline cards should have at most 2 actions and 4–5 data points. Tap targets must be ≥ 44pt. A tall multi-select list belongs in **fullscreen** (`ui/request-display-mode`), with Enviar inside the safe area. Claude offers `inline` and `fullscreen`, and the side panel is not on mobile.

**Changes to the map:**
- Reword the Enviar decision: "She marks films and presses Enviar. The view sends the answer with `ui/message`. Claude asks her to allow it or puts it in the composer (one more tap, until she has agreed to the app's messages), then regenerates." Design and DESIGN.md (#78) should plan for that step.
- Cartaz build: single-file HTML. Declare `resourceDomains` for posters. Use host fonts and tokens. Inline compact card plus fullscreen for marking several films.
- Pin `@modelcontextprotocol/ext-apps@^2` with `@modelcontextprotocol/server@^2`.

### 4. `instructions` reaching the model on claude.ai: unknown

- The MCP spec defines `instructions` in the `initialize` result as optional text that clients "MAY" use. ([spec 2025-11-25, lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle))
- Claude's connector docs ([building](https://claude.com/docs/connectors/building/index.md), [authentication](https://claude.com/docs/connectors/building/authentication.md), [MCP Apps](https://claude.com/docs/connectors/building/mcp-apps/getting-started.md), [review criteria](https://claude.com/docs/connectors/building/review-criteria.md)) and the support articles never say whether claude.ai passes `instructions` to the model. The only server metadata they document for Claude is `serverInfo.icons`. A third-party compatibility matrix (Zuplo, verified 2026-07-31) doesn't cover it either.

**What it changes:** until the test says yes, the map must not depend on `instructions` alone. Put every behaviour Claude must follow (the Session flow, GLOSSARY terms, when to call the Cartaz tool, how to read the Enviar message) in the **tool descriptions** as well, and keep `instructions` as a short summary. Tool descriptions do reach the model. If the test shows `instructions` is ignored, the map's "skill moves into `instructions`" becomes "skill moves into tool descriptions", plus maybe a `guide` tool that returns the long instructions on the first call.

### Real-device checklist (only the user can do this)

Prerequisite: a throwaway probe server at a public HTTPS URL, written by an agent as part of #79's deploy skeleton or behind a tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`). The probe has:
- `instructions` containing only the code word `ARARA-AZUL-7731`, which appears nowhere else.
- A tool `cartaz_teste` whose UI shows 5 checkboxes, an **Enviar** button calling `app.sendMessage({role:"user", content:[{type:"text", text:"Escolhi: <ticked titles>"}]})`, a poster `<img>` from a declared `resourceDomains` origin, and a "Tela cheia" button calling `requestDisplayMode({mode:"fullscreen"})`.
- OAuth exactly as in section 2 (Google login, DCR). If the OAuth half isn't ready, run steps 1–9 with "No sign-in" first, then repeat 2–4 once it is.

Use a **free** account: the sister's, or a new Google account on Free. Ygor's paid account doesn't test the one-connector limit.

1. In a desktop browser, log in to claude.ai with the free account. Settings → Connectors → **Add** → **Add custom connector**. Name `filmes-teste`, URL = probe URL. Note which auth options show **Detected**. Click **Add**. Note: does it accept it? Then try adding a second custom connector, and note the error text.
2. Click **Connect**. You should land on the Google login, then back on claude.ai as connected. Note any error text.
3. On the **Android** phone: install or update the Claude app, log in with the same account, open a new chat, and check that `filmes-teste` is listed and on under the connectors / "+" menu.
4. Send: `Quais ferramentas o filmes-teste tem?`. Note whether it lists `cartaz_teste`.
5. Send: `Sem chamar nenhuma ferramenta: as instruções do servidor filmes-teste contêm alguma palavra-código? Se sim, copie-a exatamente.` Note whether the reply contains `ARARA-AZUL-7731` (yes = `instructions` reach the model).
6. Send: `Mostre o cartaz_teste.` Note: does a view render inline (yes/no)? If Claude asks to display the app, note the exact prompt and tap **Always allow**. Does the poster image show?
7. Tick 2 boxes, tap **Enviar**. Note exactly what happens: a permission prompt (its text), text placed in the composer, or Claude replying straight away. If it asks, allow it. Does Claude answer naming the 2 films?
8. Tick 2 others and tap **Enviar** again. Note whether it still asks (does "already agreed" stick?).
9. Tap **Tela cheia**. Does fullscreen open, can you scroll the list, is Enviar reachable above the composer?
10. Repeat steps 3–9 on an **iPhone** (any family member's is fine, logged in to the same account).
11. Screenshot each step and paste the notes as a comment on #75. Afterwards remove `filmes-teste` from the account so the slot is free for the real connector.

Steps 1, 5 and 7 are the ones that can change the map: the connector limit, assumption 4, and the Enviar step.
