import { createServerFn } from '@tanstack/react-start'

/** The credits page's sources (`CREDITS`, #292), read on the server so the
 * engine stays out of the browser's bundle. Public: no Dono needed. */
export const readCredits = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { CREDITS } = await import('@filmes/engine')
    return CREDITS.map(({ source, url, use, notice }) => ({
      source,
      url,
      use,
      notice,
    }))
  },
)
