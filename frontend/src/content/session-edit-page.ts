// The edit page's server function (#372): apart from `session-edit.ts`,
// which the server's `platform/session-edit.ts` imports too.

import { createServerFn } from '@tanstack/react-start'
import { ownerMiddleware, pathSlug, requireOwner } from './owner'

/** What `/sessoes/<id>/pedido` shows (`sessionEditPage`). */
export const readSessionEdit = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .validator(pathSlug)
  .handler(async ({ context, data }) => {
    requireOwner(context.owner)
    const { appSessionEditPage } = await import('#/platform/session-edit')
    return appSessionEditPage(data, context.owner.person)
  })
