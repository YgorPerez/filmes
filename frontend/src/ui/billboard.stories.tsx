// The whole Cartaz: on the page, open and closed (the chosen film with its
// reactions, on its card or, without one, in a block above the cards),
// without sections, empty,
// and in the MCP Apps view's inline and fullscreen layouts.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, fn, within } from 'storybook/test'
import { Billboard } from './billboard'
import { CHOSEN_OUTSIDE, CLOSED, MODEL } from './billboard.fixture'

// A poster drawn here, so no story reaches the network for TMDB's.
const POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 3'%3E%3Crect width='2' height='3' fill='%23476'/%3E%3C/svg%3E"

/** The model with the posters drawn here. */
const local = (model: typeof MODEL) => ({
  ...model,
  films: model.films.map((film) => ({
    ...film,
    poster: film.poster && POSTER,
  })),
})

const LOCAL = local(MODEL)

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
  args: { billboard: local(CLOSED) },
  play: async ({ canvasElement }) => {
    // Only the chosen film has its reactions, and nothing takes a reply.
    const canvas = within(canvasElement)
    const lists = canvas.getAllByRole('list', { name: 'Filme escolhido' })
    await expect(lists).toHaveLength(1)
    await expect(lists[0]).toHaveTextContent('Bruno: previsto 8,3 · achou 6')
    await expect(lists[0]).toHaveTextContent('Iara: gostou')
    await expect(canvas.queryByRole('button', { name: 'Enviar' })).toBeNull()
  },
}

export const ClosedChosenWithoutCard: Story = {
  args: { billboard: local(CHOSEN_OUTSIDE) },
  play: async ({ canvasElement }) => {
    const block = within(
      within(canvasElement).getByRole('region', { name: 'Filme escolhido' }),
    )
    await expect(block.getByText('Curta da Madrugada (2010)')).toBeVisible()
    await expect(block.getByRole('list')).toHaveTextContent(
      'Bruno: achou 8Iara: não gostou',
    )
  },
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
