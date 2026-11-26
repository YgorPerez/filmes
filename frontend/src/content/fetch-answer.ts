// A form posted by `fetch` (#235): the header it carries, and how the
// server answers it. Client-safe: the page's `useFetchForm` and the server
// entry (`server.ts`, around every route of the app) both use it.

/** The header a form sent by `fetch` carries (`useFetchForm`): its route
 * answers `{ to }` as JSON instead of the 303, and the page goes there
 * without reloading. */
export const FETCH_HEADER = 'x-filmes-fetch'

/** The route's answer as the poster asked for it: a form sent by `fetch`
 * (`FETCH_HEADER`) gets the 303's `location` as `{ to }`, so the page goes
 * there without reloading; a plain POST gets the 303 itself. */
export const answerFetch = (request: Request, response: Response) => {
  const to = response.headers.get('Location')
  return request.headers.get(FETCH_HEADER) === '1' &&
    response.status === 303 &&
    to !== null
    ? Response.json(
        { to },
        { headers: { 'Cache-Control': 'private, no-store' } },
      )
    : response
}
