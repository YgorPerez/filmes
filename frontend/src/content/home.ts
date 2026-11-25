import { createServerFn } from '@tanstack/react-start'
import { ownerMiddleware, requireOwner } from './owner'

/** What `/` shows (`homeData`): the setup guide, the latest Sessão and the
 * MCP address. A request with no Dono is refused: the page gate does not
 * protect a server function. */
export const readHome = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    requireOwner(context.owner)
    const { appHome } = await import('#/platform/setup-guide')
    return appHome(context.owner)
  })
