import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { handleAuthRequest } from '#/platform/auth'
import { withRequestLog } from '#/platform/request-log'

// The TanStack Start server, with each request logged without the query
// (`platform/request-log.ts`). The login's `/auth/*` answers before the app
// (`platform/auth.ts`).
export default createServerEntry({
  fetch: withRequestLog(
    async (request: Request, ...rest: Parameters<typeof handler.fetch>[1][]) =>
      (await handleAuthRequest(request)) ?? handler.fetch(request, ...rest),
  ),
})
