import { createServerFn } from '@tanstack/react-start'
import { ownerMiddleware } from './owner'

/** What `/exportar` shows (`exportChoices`). A request with no Dono is
 * refused: the page gate does not protect a server function. */
export const readExportChoices = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    if (!context.owner) throw new Error('Dono required')
    const { choicesFor } = await import('#/platform/export')
    return choicesFor(context.owner)
  })
