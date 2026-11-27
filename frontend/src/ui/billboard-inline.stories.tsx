// The compact Cartaz in the conversation (MCP Apps inline): nothing marked,
// something marked with Enviar and Limpar, sent, after a regenerate, a
// Recomendação with no film, Enviar that could not go, and a closed
// Session.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, within } from 'storybook/test'
import { InlineBillboard } from './billboard-inline'
import { MODEL } from './billboard.fixture'
import { SEND_STATUS } from './billboard-send.copy'

const MARKED = ['Trocar: As Horas Lentas', 'Já vi: Sal & Ferrugem (Iara)']

const meta = {
  component: InlineBillboard,
  args: {
    billboard: { ...MODEL, version: 1 },
    marked: [],
    message: '',
    onExpand: fn(),
  },
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
  args: { marked: MARKED, onSend: fn(), onClear: fn() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(MARKED[0]!)).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Limpar' })).toBeVisible()
  },
}

export const WithStatus: Story = {
  args: { marked: MARKED, onSend: fn(), message: 'Enviando…' },
}

export const Sent: Story = {
  args: { marked: MARKED, sent: true, message: SEND_STATUS.regenerating },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: 'Enviar' })).toBeNull()
    await expect(
      canvas.getByRole('button', { name: 'Marcar de novo' }),
    ).toBeVisible()
  },
}

export const Regenerated: Story = {
  args: { billboard: MODEL },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(
        'Saiu: Sessão Maldita (Iara já viu) · entrou: Sal & Ferrugem',
      ),
    ).toBeVisible()
  },
}

export const Empty: Story = {
  args: {
    billboard: {
      ...MODEL,
      version: 1,
      films: [],
      sections: [],
      request: { ...MODEL.request, parts: ['até 30min', 'nota 7+ no IMDb'] },
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole('button', { name: /Marcar/ }),
    ).toBeNull()
  },
}

export const CouldNotSend: Story = {
  args: {
    marked: MARKED,
    onSend: fn(),
    onMessage: fn(),
    message: 'Não dá pra enviar por aqui. Toque em Copiar e cole no chat.',
    copy: '#cartaz 2026-11-20-iara v2\n1 tt9000104 · trocar\n',
  },
}

export const Closed: Story = {
  args: { billboard: { ...MODEL, open: false } },
}
