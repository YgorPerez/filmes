import { createServerFn } from '@tanstack/react-start'
import { ownerMiddleware, pathSlug, requireOwner } from './owner'

/** What `/importar` lists (`importsOverview`). A request with no Dono is
 * refused: the page gate does not protect a server function. */
export const readImportsOverview = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    requireOwner(context.owner)
    const { appImportsOverview } = await import('#/platform/imports')
    return appImportsOverview()
  })

/** What `/importar/<slug>` shows (`importsPage`). */
export const readImportsPage = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .validator(pathSlug)
  .handler(async ({ context, data }) => {
    requireOwner(context.owner)
    const { appImportsPage } = await import('#/platform/imports')
    return appImportsPage(data, context.owner.person)
  })

/** What `/fila` shows (`queuePage`). */
export const readQueue = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    requireOwner(context.owner)
    const { appQueuePage } = await import('#/platform/imports')
    return appQueuePage()
  })
