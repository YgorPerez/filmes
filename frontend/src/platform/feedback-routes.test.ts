import { describe, expect, it } from 'vite-plus/test'
import { Route as Send } from '#/routes/feedback/$sessao/enviar'
import { Route as Form } from '#/routes/_owner/sessoes/$sessao/contar'
import { Route as Sessions } from '#/routes/_owner/sessoes/index'

describe('the Feedback routes', () => {
  it('keeps only a reason the page knows in the query', () => {
    const form = Form.options.validateSearch as (search: object) => object
    expect(form({ erro: 'ambiguo' })).toEqual({ erro: 'ambiguo' })
    expect(form({ erro: 'x' })).toEqual({ erro: undefined })
  })

  it('lists only the Sessions to tell about under “para contar”', () => {
    const search = Sessions.options.validateSearch as (search: object) => {
      filtro?: string
    }
    const deps = Sessions.options.loaderDeps as (opts: {
      search: { filtro?: string }
    }) => { pendingOnly: boolean }
    expect(search({ filtro: 'para-contar' })).toEqual({
      filtro: 'para-contar',
    })
    expect(search({ filtro: 'x' })).toEqual({ filtro: undefined })
    expect(deps({ search: { filtro: 'para-contar' } })).toEqual({
      pendingOnly: true,
    })
    expect(deps({ search: {} })).toEqual({ pendingOnly: false })
  })

  it('sends a form with no Dono session to the login', async () => {
    const handlers = Send.options.server?.handlers as {
      POST: (ctx: {
        request: Request
        params: { sessao: string }
      }) => Promise<Response>
    }
    const response = await handlers.POST({
      request: new Request('http://localhost/feedback/x/enviar', {
        method: 'POST',
        body: new FormData(),
      }),
      params: { sessao: 'x' },
    })
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/entrar')
  })
})
