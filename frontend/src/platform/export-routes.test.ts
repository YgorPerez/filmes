import { describe, expect, it } from 'vite-plus/test'
import { Route as Download } from '#/routes/exportar/imdb[.]csv'
import { Route as Page } from '#/routes/_owner/exportar'

describe('the Export routes', () => {
  it('keeps only a reason the page knows in the query', () => {
    const validate = Page.options.validateSearch as (search: object) => object
    expect(validate({ erro: 'pessoa' })).toEqual({ erro: 'pessoa' })
    expect(validate({ erro: '<b>' })).toEqual({ erro: undefined })
  })

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
