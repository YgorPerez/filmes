// @vitest-environment jsdom
// The 404 and the failed page: their way back.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { LoadFailed, LostAlone, NotFound } from './lost'

afterEach(cleanup)

describe('NotFound', () => {
  it('leads a Dono home and to her Sessões', () => {
    render(<NotFound />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Essa fita não está na prateleira',
    )
    expect(
      screen
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')]),
    ).toEqual([
      ['Ir para o início', '/'],
      ['Ver Sessões', '/sessoes'],
    ])
  })

  it('for a Sessão that does not exist, says so and leads to every Sessão', () => {
    render(<NotFound what="session" />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Essa Sessão não está na prateleira',
    )
    expect(
      screen.getByRole('link', { name: 'Ver todas as Sessões' }),
    ).toHaveProperty('pathname', '/sessoes')
  })

  it('alone, leads in through Entrar, names no Sessão and ends with the credits', () => {
    render(
      <LostAlone>
        <NotFound owner={false} />
      </LostAlone>,
    )
    expect(
      screen
        .getAllByRole('link')
        .map((a) => [a.textContent, a.getAttribute('href')]),
    ).toEqual([
      ['filmes', '/'],
      ['Entrar', '/entrar'],
      ['Créditos das fontes', '/creditos'],
    ])
    expect(screen.getByRole('main').textContent).not.toContain('Sessão')
  })
})

describe('LoadFailed', () => {
  it('tries the page again', () => {
    const retry = vi.fn<() => void>()
    render(<LoadFailed onRetry={retry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(retry).toHaveBeenCalledOnce()
  })
})
