import { createServerFn } from '@tanstack/react-start'
import { ownerMiddleware } from './owner'

/** What `/pessoas` lists (`peopleList`). A request with no Dono is refused:
 * the page gate does not protect a server function. */
export const readPeopleList = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    if (!context.owner) throw new Error('Dono required')
    const { appPeopleList } = await import('#/platform/people')
    return appPeopleList()
  })

/** What `/pessoas/<slug>` shows (`personPage`). */
export const readPersonPage = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .validator((person: string) => person)
  .handler(async ({ context, data }) => {
    if (!context.owner) throw new Error('Dono required')
    const { appPersonPage } = await import('#/platform/people')
    return appPersonPage(data)
  })
