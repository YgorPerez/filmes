import { describe, expect, it } from 'vite-plus/test'
import { PAGE_TITLES, pageTitle, titled } from './page-title'

describe('page titles', () => {
  it('names the page before filmes', () => {
    expect(pageTitle(PAGE_TITLES.sessions)).toBe('Sessões · filmes')
    expect(pageTitle(PAGE_TITLES.session('2026-11-20'))).toBe(
      'Sessão de sex, 20 nov · filmes',
    )
    expect(pageTitle(null)).toBe('filmes')
    expect(titled('Pessoas')).toEqual({
      meta: [{ title: 'Pessoas · filmes' }],
    })
  })
})
