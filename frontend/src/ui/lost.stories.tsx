// The 404 and the error of a page that failed to open, inside the app shell
// and alone (no Dono).
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, userEvent, within } from 'storybook/test'
import { LoadFailed, LostAlone, NotFound } from './lost'
import { AppShell } from './shell'

const meta = {
  component: NotFound,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof NotFound>

export default meta

type Story = StoryObj<typeof meta>

export const InTheShell: Story = {
  render: () => (
    <AppShell
      owner={{ name: 'Vera', admin: false, email: 'vera@example.org' }}
      path="/operacoes"
      alert={null}
    >
      <NotFound />
    </AppShell>
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement)
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Essa fita não está na prateleira',
      }),
    ).toBeVisible()
    await expect(
      page.getByRole('link', { name: 'Ir para o início' }),
    ).toHaveAttribute('href', '/')
    await expect(
      page.getByRole('link', { name: 'Ver Sessões' }),
    ).toHaveAttribute('href', '/sessoes')
  },
}

export const SessionGone: Story = {
  args: { what: 'session' },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('link', { name: 'Ver todas as Sessões' }),
    ).toHaveAttribute('href', '/sessoes')
  },
}

export const Alone: Story = {
  render: () => (
    <LostAlone>
      <NotFound owner={false} />
    </LostAlone>
  ),
  play: async ({ canvasElement }) => {
    const page = within(canvasElement)
    await expect(page.getByRole('link', { name: 'Entrar' })).toHaveAttribute(
      'href',
      '/entrar',
    )
    await expect(page.queryByRole('link', { name: 'Ver Sessões' })).toBeNull()
    await expect(
      page.queryByRole('link', { name: 'Ir para o início' }),
    ).toBeNull()
    await expect(
      page.getByRole('link', { name: 'Créditos das fontes' }),
    ).toBeVisible()
  },
}

export const Failed: Story = {
  render: () => {
    const retry = fn()
    return <LoadFailed onRetry={retry} />
  },
  play: async ({ canvasElement }) => {
    const page = within(canvasElement)
    await userEvent.click(page.getByRole('button', { name: 'Tentar de novo' }))
    await expect(
      page.getByRole('heading', { level: 1, name: 'A fita enroscou' }),
    ).toBeVisible()
  },
}
