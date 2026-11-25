// What every Dono form route does first, and how it answers. The page gate
// (`_owner.tsx`) runs for pages, not for server handlers, so a form route
// checks the Dono itself, and only takes a form of this site (the `Origin`,
// as the logout checks). Server only.

import { currentOwner } from './auth'
import { serverEnv } from './server-env'

/** Back to a page after a POST: the browser GETs `location`. */
export const seeOther = (location: string) =>
  new Response(null, {
    status: 303,
    headers: { Location: location, 'Cache-Control': 'private, no-store' },
  })

/** The Dono who posted, or the answer for anyone else: the login for no
 * session, 403 for another site's form. */
export function formPoster<Owner>(
  request: Request,
  owner: Owner | null,
  origin: string | undefined,
): Owner | Response {
  if (!owner) return seeOther('/entrar')
  if (request.headers.get('origin') !== origin)
    return new Response('Origem recusada', { status: 403 })
  return owner
}

/** Who posted a form to the app, and the site's origin it must come from:
 * what `formPoster` checks, for a route's `serve…` function. */
export const appPoster = (request: Request) => ({
  owner: currentOwner(request),
  origin: serverEnv().APP_ORIGIN,
})
