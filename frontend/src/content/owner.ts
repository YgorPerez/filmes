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

/** What the pages may know of the Dono: the name, her Pessoa (Meu gosto)
 * and whether admin. The email and the session stay on the server. */
export const readOwner = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(({ context }) =>
    context.owner
      ? {
          name: context.owner.name,
          person: context.owner.person,
          admin: context.owner.admin,
        }
      : null,
  )

/** A server function that acts as the Dono stops here without one: the
 * page gate does not protect a server function. */
export function requireOwner<O>(owner: O | null): asserts owner is O {
  if (owner === null) throw new Error('Dono required')
}

/** The slug a Dono page names in its path (a Pessoa, a Session): a
 * non-empty string, or the server function refuses the call. */
export function pathSlug(value: unknown): string {
  if (typeof value !== 'string' || value === '')
    throw new Error('slug required')
  return value
}

/** As `requireOwner`, for the admin screens: a Dono without `admin: true`
 * is refused too. */
export function requireAdmin<O extends { admin: boolean }>(
  owner: O | null,
): asserts owner is O {
  requireOwner(owner)
  if (!owner.admin) throw new Error('admin required')
}
