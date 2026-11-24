import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { withRequestLog } from '#/platform/request-log'

// The TanStack Start server, with each request logged without the query
// (`platform/request-log.ts`).
export default createServerEntry({ fetch: withRequestLog(handler.fetch) })
