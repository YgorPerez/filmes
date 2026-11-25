import { describe, expect, it } from 'vite-plus/test'
import { Route as Send } from '#/routes/notas/enviar'
import { Route as Screen } from '#/routes/_owner/notas'

describe('the rating screen routes', () => {
  it('keeps only a count, a reason, a search and a film the page knows in the query', () => {
    const search = Screen.options.validateSearch as (search: object) => object
    expect(
      search({
        feito: '3',
        erro: 'alvo',
        buscar: ' mare ',
        filme: 'tt9000102',
      }),
    ).toEqual({ feito: 3, erro: 'alvo', buscar: 'mare', filme: 'tt9000102' })
    expect(search({ feito: 'x', erro: 'x', filme: 'Q1' })).toEqual({
      feito: undefined,
      erro: undefined,
      buscar: undefined,
      filme: undefined,
    })
  })

  it('sends Pronto with no Dono session to the login', async () => {
    const handlers = Send.options.server?.handlers as {
      POST: (ctx: { request: Request }) => Promise<Response>
    }
    const response = await handlers.POST({
      request: new Request('http://localhost/notas/enviar', {
        method: 'POST',
        body: new FormData(),
      }),
    })
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/entrar')
  })
})
