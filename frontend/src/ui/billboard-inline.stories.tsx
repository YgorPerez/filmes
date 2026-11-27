// The compact Cartaz in the conversation (MCP Apps inline): nothing marked,
// something marked with Enviar and Limpar, sent, after a regenerate, a
// Recomendação with no film, Enviar that could not go, and a closed
// Session.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, within } from 'storybook/test'
import { InlineBillboard } from './billboard-inline'
import { CLOSED, MODEL } from './billboard.fixture'
import { SEND_STATUS } from './billboard-send.copy'

const MARKED = ['Trocar: As Horas Lentas', 'Já vi: Sal & Ferrugem (Iara)']
const TAGS = { tt9000104: ['swap'], tt9000105: ['seen'] } as const

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
  args: { marked: MARKED, tags: TAGS, onSend: fn(), onClear: fn() },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(MARKED[0]!)).toBeVisible()
    // The marked film keeps its row, with its tag (#277).
    await expect(canvas.getByText('Trocar', { exact: true })).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Limpar' })).toBeVisible()
  },
}

export const WithStatus: Story = {
  args: { marked: MARKED, onSend: fn(), message: 'Enviando…' },
}

export const Sent: Story = {
  args: {
    marked: MARKED,
    tags: TAGS,
    sent: true,
    message: SEND_STATUS.regenerating,
  },
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
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('button', { name: /Marcar/ })).toBeNull()
    // The minimum IMDb rating holds always: it is no limit to loosen.
    await expect(
      canvas.getByText(
        'Nenhum filme passou no limite até 30min. Peça no chat com mais tempo ou menos limites.',
      ),
    ).toBeVisible()
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
  args: { billboard: CLOSED },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(/^Sessão fechada/u)).toBeVisible()
    await expect(canvas.getByText('Escolhido')).toBeVisible()
  },
}
