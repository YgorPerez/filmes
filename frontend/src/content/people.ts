import { createServerFn } from '@tanstack/react-start'
import { ownerMiddleware, pathSlug, requireOwner } from './owner'

/** What `/pessoas` lists (`peopleList`). A request with no Dono is refused:
 * the page gate does not protect a server function. */
export const readPeopleList = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    requireOwner(context.owner)
    const { appPeopleList } = await import('#/platform/people')
    return appPeopleList()
  })

/** What `/pessoas/<slug>` shows (`personPage`). */
export const readPersonPage = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .validator(pathSlug)
  .handler(async ({ context, data }) => {
    requireOwner(context.owner)
    const { appPersonPage } = await import('#/platform/people')
    return appPersonPage(data, context.owner)
  })
