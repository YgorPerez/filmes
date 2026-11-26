import { describe, expect, it } from 'vite-plus/test'
import { Route as Send } from '#/routes/feedback/$sessao/enviar'
import { Route as Form } from '#/routes/_owner/sessoes/$sessao/contar'

describe('the Feedback routes', () => {
  it('keeps only a reason the page knows in the query', () => {
    const form = Form.options.validateSearch as (search: object) => object
    expect(form({ erro: 'ambiguo' })).toEqual({ erro: 'ambiguo' })
    expect(form({ erro: 'x' })).toEqual({ erro: undefined })
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
