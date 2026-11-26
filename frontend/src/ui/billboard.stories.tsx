// The whole Cartaz: on the page, open and closed, without sections, empty,
// and in the MCP Apps view's inline and fullscreen layouts.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, within } from 'storybook/test'
import { Billboard } from './billboard'
import { MODEL } from './billboard.fixture'

// A poster drawn here, so no story reaches the network for TMDB's.
const POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 3'%3E%3Crect width='2' height='3' fill='%23476'/%3E%3C/svg%3E"

const LOCAL = {
  ...MODEL,
  films: MODEL.films.map((film) => ({
    ...film,
    poster: film.poster && POSTER,
  })),
}

const meta = {
  component: Billboard,
  args: { billboard: LOCAL, action: '/sessoes/x/responder' },
} satisfies Meta<typeof Billboard>

export default meta

type Story = StoryObj<typeof meta>

export const Page: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: '1 As Horas Lentas' }),
    ).toBeVisible()
    await expect(canvas.getByRole('button', { name: 'Enviar' })).toBeVisible()
  },
}

export const WithoutSections: Story = {
  args: { billboard: { ...LOCAL, sections: [] } },
}

export const Closed: Story = {
  args: { billboard: { ...LOCAL, open: false } },
}

export const Empty: Story = {
  args: { billboard: { ...LOCAL, films: [], sections: [], dropped: [] } },
}

export const Inline: Story = {
  args: {
    action: undefined,
    layout: 'inline',
    onExpand: fn(),
    onSend: fn(),
  },
}

export const Fullscreen: Story = {
  args: { action: undefined, layout: 'fullscreen', onSend: fn() },
}
