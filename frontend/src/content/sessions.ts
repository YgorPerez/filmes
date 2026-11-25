import { createServerFn } from '@tanstack/react-start'
import { ownerMiddleware, pathSlug, requireOwner } from './owner'

/** What `/sessoes` lists (`sessionList`). A request with no Dono is
 * refused: the page gate does not protect a server function. */
export const readSessions = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    requireOwner(context.owner)
    const { appSessionList } = await import('#/platform/sessions')
    return appSessionList()
  })

/** What the "Nova Sessão" form offers (`requestOptions`). */
export const readRequestOptions = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    requireOwner(context.owner)
    const { appRequestOptions } = await import('#/platform/sessions')
    return appRequestOptions()
  })

/** What `/sessoes/<id>` shows (`sessionPage`). */
export const readSessionPage = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .validator(pathSlug)
  .handler(async ({ context, data }) => {
    requireOwner(context.owner)
    const { appSessionPage } = await import('#/platform/sessions')
    return appSessionPage(data)
  })
