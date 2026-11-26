import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { answerFetch } from '#/content/fetch-answer'
import { handleAuthRequest } from '#/platform/auth'
import { engineReady } from '#/platform/engine'
import { fontRequest } from '#/platform/fonts'
import { handleMcpRequest } from '#/platform/mcp-endpoint'
import { withRequestLog } from '#/platform/request-log'

// Filmes-dados reloaded into the live database as the server starts
// (`platform/engine.ts`, #104); each request waits for it.
const ready = engineReady()

// The TanStack Start server, with each request logged without the query
// (`platform/request-log.ts`). The login's `/auth/*` answers before the app
// (`platform/auth.ts`), and so do the MCP connector's `/mcp`, `/oauth/*` and
// their `/.well-known/` metadata (`platform/mcp-endpoint.ts`), and the
// fonts' `/fonts/*` (`platform/fonts.ts`), which needs no database. A form
// the app posts by `fetch` (#235) gets its route's 303 as `{ to }`
// (`content/fetch-answer.ts`), whichever route it posted to.
export default createServerEntry({
  fetch: withRequestLog(
    async (
      request: Request,
      ...rest: Parameters<typeof handler.fetch>[1][]
    ) => {
      const font = fontRequest(request)
      if (font) return font
      await ready
      return (
        (await handleAuthRequest(request)) ??
        (await handleMcpRequest(request)) ??
        answerFetch(request, await handler.fetch(request, ...rest))
      )
    },
  ),
})
