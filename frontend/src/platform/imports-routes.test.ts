import { describe, expect, it } from 'vite-plus/test'
import { Route as QueuePost } from '#/routes/fila/acao'
import { Route as ImportPost } from '#/routes/importar/$pessoa/acao'
import { Route as Queue } from '#/routes/_owner/fila'
import { Route as Person } from '#/routes/_owner/importar/$pessoa'
import { Route as List } from '#/routes/_owner/importar/index'

type Post = (ctx: {
  request: Request
  params: Record<string, string>
}) => Promise<Response>

const postOf = (route: { options: { server?: unknown } }) =>
  (route.options.server as { handlers: { POST: Post } }).handlers.POST

describe('the Imports routes', () => {
  it('keep only a notice, a reason or a count the page knows', () => {
    const person = Person.options.validateSearch as (search: object) => object
    expect(
      person({ feito: 'trakt', erro: 'arquivo', novos: 3, fora: '2' }),
    ).toEqual({ feito: 'trakt', erro: 'arquivo', novos: 3, fora: 2 })
    expect(
      person({ feito: '<b>', erro: 'x', novos: -1, fora: 'muitos' }),
    ).toEqual({
      feito: undefined,
      erro: undefined,
      novos: undefined,
      fora: undefined,
    })
    const queue = Queue.options.validateSearch as (search: object) => object
    expect(queue({ feito: 'reprocessado', resolvidos: 2, restam: 0 })).toEqual({
      feito: 'reprocessado',
      erro: undefined,
      resolvidos: 2,
      restam: 0,
    })
    expect(queue({ erro: 'sem-imdb', resolvidos: 1.5 })).toEqual({
      feito: undefined,
      erro: 'sem-imdb',
      resolvidos: undefined,
      restam: undefined,
    })
    const list = List.options.validateSearch as (search: object) => object
    expect(list({ erro: 'pessoa' })).toEqual({ erro: 'pessoa' })
    expect(list({ erro: 'x' })).toEqual({ erro: undefined })
  })

  it('send a form with no Dono session to the login', async () => {
    for (const [post, path, params] of [
      [postOf(ImportPost), '/importar/teo/acao', { pessoa: 'teo' }],
      [postOf(QueuePost), '/fila/acao', {}],
    ] as const) {
      const response = await post({
        request: new Request(`http://localhost${path}`, {
          method: 'POST',
          body: new FormData(),
        }),
        params,
      })
      expect(response.status).toBe(303)
      expect(response.headers.get('Location')).toBe('/entrar')
    }
  })
})
