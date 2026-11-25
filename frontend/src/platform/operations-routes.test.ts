import { describe, expect, it } from 'vite-plus/test'
import { Route as Post } from '#/routes/operacoes/acao'
import { Route as Page } from '#/routes/_owner/operacoes'

describe('the Operações routes', () => {
  it('keep only the SQL, a notice or a reason the page knows', () => {
    const validate = Page.options.validateSearch as (search: object) => object
    expect(
      validate({ sql: 'SELECT 1', feito: 'avaliando', erro: 'sem-pasta' }),
    ).toEqual({ sql: 'SELECT 1', feito: 'avaliando', erro: 'sem-pasta' })
    expect(validate({ sql: '  ', feito: '<b>', erro: 'x' })).toEqual({
      sql: undefined,
      feito: undefined,
      erro: undefined,
    })
    expect(validate({ sql: 3 })).toMatchObject({ sql: undefined })
  })

  it('send a form with no Dono session to the login', async () => {
    const { POST } = (
      Post.options.server as {
        handlers: { POST: (ctx: { request: Request }) => Promise<Response> }
      }
    ).handlers
    const response = await POST({
      request: new Request('http://localhost/operacoes/acao', {
        method: 'POST',
        body: new FormData(),
      }),
    })
    expect(response.status).toBe(303)
    expect(response.headers.get('Location')).toBe('/entrar')
  })

  it('hide the page from a Dono who is not admin', () => {
    const beforeLoad = Page.options.beforeLoad as (ctx: {
      context: { owner: { admin: boolean } }
    }) => void
    const thrown = (admin: boolean) => {
      try {
        beforeLoad({ context: { owner: { admin } } })
        return null
      } catch (error) {
        return error
      }
    }
    expect(thrown(false)).toMatchObject({ isNotFound: true })
    expect(thrown(true)).toBeNull()
  })
})
