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

  it('alone, offers Entrar and no Sessões', () => {
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
      ['Ir para o início', '/'],
    ])
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
