// The log of each request on the server, modeled on pesquisa-relacionamentos
// (`frontend/src/platform/request-log.ts`): one stdout line per request,
// `GET /sessoes 200 12ms`, which `docker logs` shows. The query and the
// fragment stay out (an OAuth `code`, a search), and the body, the cookies,
// the e-mail and the IP never enter the line (map #72, "Observability").

type Fetch<Rest extends unknown[]> = (
  request: Request,
  ...rest: Rest
) => Response | Promise<Response>

type Options = {
  /** Where the line goes. On the server, the stdout `docker logs` reads. */
  write?: (line: string) => void
  /** Milliseconds from a clock that only moves forward. */
  now?: () => number
}

/** Wraps the server's `fetch`. `rest` are the options Start passes after the
 * request, which go on as they came. */
export function withRequestLog<Rest extends unknown[]>(
  fetch: Fetch<Rest>,
  { write = console.log, now = () => performance.now() }: Options = {},
): (request: Request, ...rest: Rest) => Promise<Response> {
  return async (request, ...rest) => {
    const start = now()
    const line = (status: number) =>
      `${request.method} ${new URL(request.url).pathname} ${status} ${Math.round(now() - start)}ms`
    let response: Response
    try {
      response = await fetch(request, ...rest)
    } catch (error) {
      write(line(500))
      throw error
    }
    write(line(response.status))
    return response
  }
}
