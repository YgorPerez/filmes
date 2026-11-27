import { describe, expect, it } from 'vite-plus/test'
import { Route as ImdbDownload } from '#/routes/exportar/imdb[.]csv'
import { Route as LetterboxdDownload } from '#/routes/exportar/letterboxd[.]csv'

describe.each([
  ['IMDb', ImdbDownload, 'imdb'],
  ['Letterboxd', LetterboxdDownload, 'letterboxd'],
] as const)('the %s download route', (_, Download, format) => {
  it('sends a request with no Dono session to the login', async () => {
    const handlers = Download.options.server?.handlers as {
      GET: (ctx: { request: Request }) => Promise<Response>
    }
    const response = await handlers.GET({
      request: new Request(
        `http://localhost/exportar/${format}.csv?pessoa=bruno`,
      ),
    })
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/entrar')
  })
})
