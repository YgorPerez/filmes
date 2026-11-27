// @vitest-environment jsdom
// The app shell around every Dono page: the top bar with the avatar's
// menu, the four tabs in their two places, and the push strip for an admin.
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
  lastPushedAt: null,
  queued: [],
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
    <AppShell
      owner={{ name: 'Bruno', admin, email: 'bruno@example.org' }}
      path={path}
      alert={alert}
    >
      <main>a página</main>
    </AppShell>,
  )

/** The menu the avatar's button opens (a popover, closed in the test). */
const menuOf = (button: HTMLElement) => {
  const menu = document.getElementById(button.getAttribute('popovertarget')!)
  if (!menu) throw new Error('no menu')
  return menu
}

/** Both places of the tabs: the top bar's (from 900px) and the bottom's. */
const tabBars = () => screen.getAllByRole('navigation', { name: 'Seções' })

describe('AppShell', () => {
  it('wraps the page with "filmes" leading home, and no alert', () => {
    const { container } = show()
    expect(screen.getByText('a página')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'filmes, início' })).toHaveProperty(
      'pathname',
      '/',
    )
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('has the four tabs in both places', () => {
    show({ admin: true })
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
        ['Meu gosto', '/meu-gosto'],
      ])
  })

  it('opens the menu from the avatar, with Sair by POST', () => {
    show()
    const avatar = screen.getByRole('button', { name: 'Sua conta: Bruno' })
    const menu = menuOf(avatar)
    expect(menu.getAttribute('popover')).toBe('auto')
    expect(menu.getAttribute('aria-label')).toBe('Conta')
    const logout = within(menu).getByRole('button', {
      name: 'Sair',
      hidden: true,
    })
    const form = logout.closest('form')
    expect(form?.getAttribute('method')).toBe('post')
    expect(form?.getAttribute('action')).toBe('/auth/logout')
    expect(
      within(menu).queryByRole('link', { name: /Operações/, hidden: true }),
    ).toBeNull()
  })

  it('puts Operações in the menu for an admin, saying when the push fails', () => {
    show({ admin: true })
    // Closed until the avatar opens it: hidden from the tree till then.
    const menu = () => menuOf(screen.getByRole('button', { name: /Sua conta/ }))
    expect(
      within(menu()).getByRole('link', { name: 'Operações', hidden: true }),
    ).toHaveProperty('pathname', '/operacoes')
    cleanup()
    show({ admin: true, alert: ALERT })
    expect(
      within(menu()).getByRole('link', { name: /^Operações/, hidden: true })
        .textContent,
    ).toBe('Operaçõesenvio falhando')
  })

  it.each([
    ['/', 'Início'],
    ['/sessoes/2026-11-20-1', 'Sessões'],
    ['/sessoes/2026-11-20-1/contar', 'Sessões'],
    ['/pessoas/vera', 'Pessoas'],
    ['/pessoas/vera/importar', 'Pessoas'],
    ['/meu-gosto', 'Meu gosto'],
    ['/meu-gosto/fila', 'Meu gosto'],
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

  it('marks the avatar, not a tab, on Operações', () => {
    show({ path: '/operacoes', admin: true })
    for (const bar of tabBars())
      expect(within(bar).queryByRole('link', { current: 'page' })).toBeNull()
    expect(
      screen
        .getByRole('button', { name: 'Sua conta: Bruno' })
        .getAttribute('aria-current'),
    ).toBe('page')
  })

  it('says in the menu which Google e-mail entered', () => {
    show()
    const menu = menuOf(screen.getByRole('button', { name: /Sua conta/ }))
    expect(menu.textContent).toContain('Entrou com bruno@example.org')
  })

  it('shows an admin the strip of a push that keeps failing, with a link to Operações', () => {
    show({ admin: true, alert: ALERT })
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain(
      'falhou 5 vezes seguidas. 4 commits na fila.',
    )
    expect(
      within(alert).getByRole('link', { name: 'Ver Operações' }),
    ).toHaveProperty('pathname', '/operacoes')
  })

  it('links the credits from the footer, after the page', () => {
    show()
    const footer = screen.getByRole('contentinfo')
    expect(
      within(footer).getByRole('link', { name: 'Créditos das fontes' }),
    ).toHaveProperty('pathname', '/creditos')
    expect(
      screen.getByText('a página').compareDocumentPosition(footer) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
})
