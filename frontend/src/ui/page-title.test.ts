import { describe, expect, it } from 'vite-plus/test'
import { pageTitle, titleOf } from './page-title'

const at = (routeId: string, loaderData?: unknown) => [
  { routeId: '__root__', status: 'success' },
  { routeId: '/_owner', status: 'success' },
  { routeId, status: 'success', loaderData },
]

describe('page titles', () => {
  it('names the page before filmes', () => {
    expect(titleOf(at('/_owner/sessoes/'))).toBe('Sessões · filmes')
    expect(titleOf(at('/_owner/meu-gosto/notas'))).toBe('Dar notas · filmes')
    expect(titleOf(at('/trakt'))).toBe('Trakt · filmes')
    expect(titleOf(at('/creditos'))).toBe('Créditos · filmes')
  })

  it('takes a Session’s day and a Pessoa’s name from the page', () => {
    expect(
      titleOf(
        at('/_owner/sessoes/$sessao/', { session: { date: '2026-11-20' } }),
      ),
    ).toBe('Sessão de sex, 20 nov · filmes')
    expect(titleOf(at('/_owner/sessoes/$sessao/', 'unknown'))).toBe('filmes')
    expect(
      titleOf(at('/_owner/pessoas/$pessoa/', { page: { name: 'Iara' } })),
    ).toBe('Iara · filmes')
    expect(titleOf(at('/_owner/pessoas/$pessoa/', { page: null }))).toBe(
      'filmes',
    )
  })

  it('says when the address leads nowhere', () => {
    expect(
      titleOf([{ routeId: '__root__', status: 'success', _notFound: true }]),
    ).toBe('Página não encontrada · filmes')
    expect(
      titleOf([{ routeId: '/_owner/operacoes', status: 'notFound' }]),
    ).toBe('Página não encontrada · filmes')
  })

  it('is filmes alone for a page with no title', () => {
    expect(titleOf(at('/saude'))).toBe('filmes')
    expect(pageTitle()).toBe('filmes')
  })
})
