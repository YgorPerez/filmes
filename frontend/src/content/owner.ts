import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'

/** The request-scoped Owner: whoever is logged in, looked up again on each
 * request (`platform/auth.ts`). A server function that acts as the Dono
 * takes it from `context.owner` and refuses when it is null:
 *
 *   createServerFn().middleware([ownerMiddleware]).handler(({ context }) => …)
 *
 * The import is inside the handler, so the browser bundle never sees
 * `node:sqlite` nor filmes-dados. */
export const ownerMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const { currentOwner } = await import('#/platform/auth')
    setResponseHeader('Cache-Control', 'private, no-store')
    return next({ context: { owner: currentOwner(getRequest()) } })
  },
)

/** What the pages may know of the Dono: the name and whether admin. The
 * email and the session stay on the server. */
export const readOwner = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(({ context }) =>
    context.owner
      ? { name: context.owner.name, admin: context.owner.admin }
      : null,
  )
