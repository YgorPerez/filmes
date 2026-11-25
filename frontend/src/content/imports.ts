import { createServerFn } from '@tanstack/react-start'
import { ownerMiddleware } from './owner'

/** What `/importar` lists (`importsOverview`). A request with no Dono is
 * refused: the page gate does not protect a server function. */
export const readImportsOverview = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    if (!context.owner) throw new Error('Dono required')
    const { appImportsOverview } = await import('#/platform/imports')
    return appImportsOverview()
  })

/** What `/importar/<slug>` shows (`importsPage`). */
export const readImportsPage = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .validator((person: string) => person)
  .handler(async ({ context, data }) => {
    if (!context.owner) throw new Error('Dono required')
    const { appImportsPage } = await import('#/platform/imports')
    return appImportsPage(data)
  })

/** What `/fila` shows (`queuePage`). */
export const readQueue = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    if (!context.owner) throw new Error('Dono required')
    const { appQueuePage } = await import('#/platform/imports')
    return appQueuePage()
  })
