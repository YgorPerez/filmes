import { describe, expect, it } from 'vite-plus/test'
import { Route as Download } from '#/routes/exportar/imdb[.]csv'

describe('the IMDb download route', () => {
  it('sends a request with no Dono session to the login', async () => {
    const handlers = Download.options.server?.handlers as {
      GET: (ctx: { request: Request }) => Promise<Response>
    }
    const response = await handlers.GET({
      request: new Request('http://localhost/exportar/imdb.csv?pessoa=bruno'),
    })
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/entrar')
  })
})
