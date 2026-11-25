import { createServerFn } from '@tanstack/react-start'
import { ownerMiddleware, requireOwner } from './owner'

/** What `/notas` shows: the logged-in Dono's Fila de Notas
 * (`ratingQueuePage`). A request with no Dono is refused: the page gate
 * does not protect a server function. */
export const readRatingQueue = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    requireOwner(context.owner)
    const { appRatingQueue } = await import('#/platform/ratings')
    return appRatingQueue(context.owner)
  })
