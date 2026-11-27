// The app shell around a Dono page: the top bar, the tabs in both places
// and, for an admin, the push strip.
import type { PushStatus } from '@filmes/engine'
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { AppShell } from './shell'

const FAILING: PushStatus = {
  enabled: true,
  pending: 4,
  failures: 5,
  failingSince: '2026-11-20T10:00:00Z',
  lastError: 'fatal',
  alert: true,
  lastPushedAt: null,
  queued: [],
}

const meta = {
  component: AppShell,
  parameters: { layout: 'fullscreen' },
  args: {
    owner: { name: 'Bruno', admin: false, email: 'bruno@example.org' },
    path: '/',
    alert: null,
    children: <main className="p-2xl">A página do Dono.</main>,
  },
} satisfies Meta<typeof AppShell>

export default meta

type Story = StoryObj<typeof meta>

export const Home: Story = {
  // The tabs live in the top bar from 900px and at the bottom under it:
  // one place shows at each width.
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getAllByRole('navigation', { name: 'Seções' }),
    ).toHaveLength(1)
  },
}

export const Sessions: Story = { args: { path: '/sessoes' } }

export const AdminWithFailingPush: Story = {
  args: {
    owner: { name: 'Vera', admin: true, email: 'vera@example.org' },
    alert: FAILING,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByRole('alert')).toBeVisible()
    // In the 240px menu, the warning beside Operações stays on one line.
    canvas.getByRole('button', { name: /Sua conta/ }).click()
    const note = canvas.getByText('falhando')
    await expect(note).toBeVisible()
    const lineHeight = Number.parseFloat(getComputedStyle(note).lineHeight)
    await expect(note.getBoundingClientRect().height).toBeLessThan(
      lineHeight * 1.5,
    )
    const row = canvas.getByRole('link', { name: /^Operações/ })
    await expect(row.scrollWidth).toBeLessThanOrEqual(row.clientWidth)
  },
}
