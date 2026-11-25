import { describe, expect, it } from 'vite-plus/test'
import { Route as Action } from '#/routes/pessoas/$pessoa/acao'
import { Route as Person } from '#/routes/_owner/pessoas/$pessoa'
import { Route as List } from '#/routes/_owner/pessoas/index'

describe('the Pessoas routes', () => {
  it('keeps only a notice or a reason the page knows in the query', () => {
    const person = Person.options.validateSearch as (search: object) => object
    expect(person({ feito: 'gravado', erro: 'alvo' })).toEqual({
      feito: 'gravado',
      erro: 'alvo',
    })
    expect(person({ feito: '<b>', erro: 'x' })).toEqual({
      feito: undefined,
      erro: undefined,
    })
    const list = List.options.validateSearch as (search: object) => object
    expect(list({ erro: 'pessoa' })).toEqual({ erro: 'pessoa' })
    expect(list({ erro: 'x' })).toEqual({ erro: undefined })
  })

  it('sends a form with no Dono session to the login', async () => {
    const handlers = Action.options.server?.handlers as {
      POST: (ctx: {
        request: Request
        params: { pessoa: string }
      }) => Promise<Response>
    }
    const response = await handlers.POST({
      request: new Request('http://localhost/pessoas/iara/acao', {
        method: 'POST',
        body: new FormData(),
      }),
      params: { pessoa: 'iara' },
    })
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/entrar')
  })
})
