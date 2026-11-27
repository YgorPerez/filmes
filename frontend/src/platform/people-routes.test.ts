import { describe, expect, it } from 'vite-plus/test'
import { Route as Action } from '#/routes/pessoas/$pessoa/acao'
import { Route as Create } from '#/routes/pessoas/nova/enviar'
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
    expect(list({ erro: 'x', nome: 3 })).toEqual({ erro: undefined })
    // A refused create comes back with what was typed, strings only.
    expect(
      list({
        erro: 'existe',
        nome: 'Iara',
        apelidos: 'ia',
        dono: 'sim',
        email: 'iara@example.org',
      }),
    ).toEqual({
      erro: 'existe',
      nome: 'Iara',
      apelidos: 'ia',
      dono: 'sim',
      email: 'iara@example.org',
    })
    expect(person({ feito: 'criada' })).toEqual({
      feito: 'criada',
      erro: undefined,
    })
  })
})

describe('the Pessoas routes without a Dono session', () => {
  it('sends a create form with no Dono session to the login', async () => {
    const handlers = Create.options.server?.handlers as {
      POST: (ctx: { request: Request }) => Promise<Response>
    }
    const response = await handlers.POST({
      request: new Request('http://localhost/pessoas/nova/enviar', {
        method: 'POST',
        body: new FormData(),
      }),
    })
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/entrar')
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
