// What every Dono form route does first, and how it answers. The page gate
// (`_owner.tsx`) runs for pages, not for server handlers, so a form route
// checks the Dono itself, and only takes a form of this site (the `Origin`,
// as the logout checks). Server only.
//
// A failed engine run answers with `falha` when waiting does not fix it (a
// database of another schema or none, a bug) and `indisponivel`, "tente de
// novo daqui a pouco", for the rest: a source off the air, a database
// another write holds (#258).

import type { ErrorOutput } from '@filmes/engine'
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

const BROKEN = new Set(['outdated_database', 'missing_database', 'internal'])

/** SQLite's busy refusal, which comes out as `internal` and passes. */
const BUSY = /database is (locked|busy)/

/** `falha` or `indisponivel` for an engine error a form has no reason of
 * its own for. */
export function failureOf(outcome: {
  output: ErrorOutput
}): 'falha' | 'indisponivel' {
  const { code, message } = outcome.output.error
  return BROKEN.has(code) && !BUSY.test(message) ? 'falha' : 'indisponivel'
}
