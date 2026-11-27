import { describe, expect, it } from 'vite-plus/test'
import { doneOf, importsSearch } from '#/content/imports-search'
import { Route as QueuePost } from '#/routes/fila/acao'
import { Route as ImportPost } from '#/routes/importar/$pessoa/acao'
import { Route as Queue } from '#/routes/_owner/meu-gosto/fila'
import { Route as Person } from '#/routes/_owner/pessoas/$pessoa/importar'

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
      person({ mudaram: '1', mudou: 'Maré Baixa~9~1', iguais: 2, lista: 'x' }),
    ).toEqual({ mudaram: 1, mudou: 'Maré Baixa~9~1', iguais: 2 })
    expect(
      doneOf(
        importsSearch({ feito: 'trakt', notas: '1', mudou: 'Maré Baixa~9~1' }),
      ),
    ).toEqual({
      notice: 'trakt',
      facts: 0,
      ratings: 1,
      seen: 0,
      changed: 0,
      changes: [{ title: 'Maré Baixa', from: 9, to: 1 }],
      repeated: 0,
      watchlist: 0,
      outside: undefined,
    })
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
