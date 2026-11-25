import { createServerFn } from '@tanstack/react-start'
import { ownerMiddleware, requireOwner } from './owner'

/** What `/exportar` shows (`exportChoices`). A request with no Dono is
 * refused: the page gate does not protect a server function. */
export const readExportChoices = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    requireOwner(context.owner)
    const { choicesFor } = await import('#/platform/export')
    return choicesFor(context.owner)
  })
