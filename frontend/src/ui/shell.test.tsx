// @vitest-environment jsdom
// The app shell around every Dono page: the top bar, the tabs in their two
// places, and the push strip for an admin.
import type { PushStatus } from '@filmes/engine'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { AppShell } from './shell'

afterEach(cleanup)

const ALERT: PushStatus = {
  enabled: true,
  pending: 4,
  failures: 5,
  failingSince: '2026-11-20T10:00:00Z',
  lastError: 'fatal',
  alert: true,
}

const show = ({
  path = '/',
  admin = false,
  alert = null,
}: {
  path?: string
  admin?: boolean
  alert?: PushStatus | null
} = {}) =>
  render(
    <AppShell owner={{ name: 'Bruno', admin }} path={path} alert={alert}>
      <main>a página</main>
    </AppShell>,
  )

/** Both places of the tabs: the top bar's (from 900px) and the bottom's. */
const tabBars = () => screen.getAllByRole('navigation', { name: 'Seções' })

describe('AppShell', () => {
  it('wraps the page with "filmes" leading home, and a logout by POST', () => {
    const { container } = show()
    expect(screen.getByText('a página')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'filmes, início' })).toHaveProperty(
      'pathname',
      '/',
    )
    const logout = screen.getByRole('button', { name: 'Sair' })
    const form = logout.closest('form')
    expect(form?.getAttribute('method')).toBe('post')
    expect(form?.getAttribute('action')).toBe('/auth/logout')
    expect(screen.getByRole('img', { name: 'Você: Bruno' })).toBeTruthy()
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('has the tabs in both places, and Operações only for an admin', () => {
    show()
    const bars = tabBars()
    expect(bars).toHaveLength(2)
    for (const bar of bars)
      expect(
        within(bar)
          .getAllByRole('link')
          .map((a) => [a.textContent, a.getAttribute('href')]),
      ).toEqual([
        ['Início', '/'],
        ['Sessões', '/sessoes'],
        ['Pessoas', '/pessoas'],
        ['Importar', '/importar'],
      ])
    cleanup()
    show({ admin: true })
    for (const bar of tabBars())
      expect(
        within(bar).getByRole('link', { name: 'Operações' }),
      ).toHaveProperty('pathname', '/operacoes')
  })

  it.each([
    ['/', 'Início'],
    ['/sessoes/2026-11-20-1', 'Sessões'],
    ['/feedback/2026-11-20-1', 'Sessões'],
    ['/pessoas/vera', 'Pessoas'],
    ['/fila', 'Importar'],
  ])('marks the tab of %s', (path, tab) => {
    show({ path })
    for (const bar of tabBars())
      expect(
        within(bar)
          .getAllByRole('link')
          .filter((a) => a.getAttribute('aria-current') === 'page')
          .map((a) => a.textContent),
      ).toEqual([tab])
  })

  it('marks no tab for a page out of them', () => {
    show({ path: '/exportar' })
    expect(document.querySelector('[aria-current]')).toBeNull()
  })

  it('shows an admin the strip of a push that keeps failing, with a link to Operações', () => {
    show({ admin: true, alert: ALERT })
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('falhou 5 vezes seguidas; 4 commits')
    expect(
      within(alert).getByRole('link', { name: 'Ver Operações' }),
    ).toHaveProperty('pathname', '/operacoes')
  })
})
