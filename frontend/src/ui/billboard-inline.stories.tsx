// The compact Cartaz in the conversation (MCP Apps inline): nothing marked,
// something marked with Enviar, and a closed Session.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, within } from 'storybook/test'
import { InlineBillboard } from './billboard-inline'
import { MODEL } from './billboard.fixture'

const meta = {
  component: InlineBillboard,
  args: { billboard: MODEL, summary: '', message: '', onExpand: fn() },
} satisfies Meta<typeof InlineBillboard>

export default meta

type Story = StoryObj<typeof meta>

export const NothingMarked: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('As Horas Lentas'),
    ).toBeVisible()
  },
}

export const Marked: Story = {
  args: { summary: '1 Trocar e 1 Já vi', onSend: fn() },
}

export const WithStatus: Story = {
  args: { summary: '1 Trocar', onSend: fn(), message: 'Enviando…' },
}

export const Closed: Story = {
  args: { billboard: { ...MODEL, open: false } },
}
