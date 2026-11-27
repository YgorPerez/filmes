// One film of the Cartaz: with a poster and marks, a bet without poster,
// marked Trocar, a Trocar the stars marked, and read-only once the Session
// has its Feedback; the Nota prevista line under "Por que", without one,
// with a Presente without a Fato, and six Presentes on a phone; the
// trailer link, and a film without one.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { BillboardCard } from './billboard-card'
import { MODEL } from './billboard.fixture'
import type { FilmMarks } from './billboard-marks'
import type { BillboardPerson } from '@filmes/engine'

// A poster drawn here, so no story reaches the network for TMDB's.
const POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 3'%3E%3Crect width='2' height='3' fill='%23476'/%3E%3C/svg%3E"

const [FIRST, BET] = MODEL.films
const FILM = { ...FIRST!, poster: POSTER }

const [BRUNO, IARA] = MODEL.attendees

/** Four more Presentes, after Bruno and Iara, in the Session's colours. */
const MORE: BillboardPerson[] = ['Caio', 'Lia', 'Quim', 'Teo'].map(
  (name, index) => ({
    slug: name.toLowerCase(),
    name,
    label: name,
    initial: name[0]!,
    color: index + 3,
    owner: false,
  }),
)
const SIX = [BRUNO!, IARA!, ...MORE]

const NO_MARKS: FilmMarks = {
  seen: [],
  ratings: {},
  thoughts: {},
  swap: false,
  swapWhy: null,
  stars: 0,
  comment: '',
}

/** The card with its marks held here, as the Cartaz holds them. */
function Marked(props: Parameters<typeof BillboardCard>[0]) {
  const [marks, setMarks] = useState(props.marks ?? NO_MARKS)
  return <BillboardCard {...props} marks={marks} onChange={setMarks} />
}

const meta = {
  component: BillboardCard,
  args: { film: FILM, people: MODEL.attendees, first: true },
} satisfies Meta<typeof BillboardCard>

export default meta

type Story = StoryObj<typeof meta>

export const WithMarks: Story = {
  render: (args) => <Marked {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const swap = canvas.getByRole('button', { name: 'Trocar' })
    await userEvent.click(swap)
    await expect(swap).toHaveAttribute('aria-pressed', 'true')
  },
}

export const Bet: Story = {
  args: { film: BET!, first: false },
  render: (args) => <Marked {...args} />,
}

export const Swapped: Story = {
  args: { marks: { ...NO_MARKS, swap: true, swapWhy: 'owner' } },
  render: (args) => <Marked {...args} />,
}

/** 2 stars turned the Trocar on, and the line under the buttons says why
 * (#326). */
export const SwappedByStars: Story = {
  args: { marks: { ...NO_MARKS, swap: true, swapWhy: 'stars', stars: 2 } },
  render: (args) => <Marked {...args} />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText('Trocar marcado: 2 estrelas'),
    ).toBeVisible()
  },
}

/** Bruno has a Nota prevista, Iara none; a tap on his name opens its hint
 * under it. */
export const ReadOnly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const hint = 'pela nota de 12 pessoas de gosto parecido'
    const name = canvas.getByRole('button', { name: `Bruno: ${hint}` })
    await expect(canvas.getByText(hint)).not.toBeVisible()
    await userEvent.click(name)
    const popover = canvas.getByText(hint)
    await expect(popover).toBeVisible()
    const box = popover.getBoundingClientRect()
    await expect(box.top).toBeGreaterThanOrEqual(
      name.getBoundingClientRect().bottom,
    )
    await expect(box.left).toBeGreaterThanOrEqual(0)
    await expect(box.right).toBeLessThanOrEqual(window.innerWidth)
    await expect(canvas.queryByRole('button', { name: /^Iara:/ })).toBeNull()
  },
}

export const UnderSection: Story = { args: { level: 3 } }

export const WithAwards: Story = {
  args: {
    film: {
      ...FILM,
      awards: ['Oscar de melhor filme', 'indicado à Palma de Ouro'],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Oscar de melhor filme')).toBeVisible()
    await expect(canvas.getByText('indicado à Palma de Ouro')).toBeVisible()
  },
}

export const WithCritics: Story = {
  args: {
    film: {
      ...FILM,
      awards: ['Oscar de melhor filme'],
      critics: ['93% no Rotten Tomatoes', 'nota 81 no Metacritic'],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Oscar de melhor filme')).toBeVisible()
    await expect(canvas.getByText('93% no Rotten Tomatoes')).toBeVisible()
    await expect(canvas.getByText('nota 81 no Metacritic')).toBeVisible()
  },
}

/** The trailer opens YouTube in a new tab: a link, never a player. */
export const WithTrailer: Story = {
  play: async ({ canvasElement }) => {
    const trailer = within(canvasElement).getByRole('link', {
      name: 'trailer',
    })
    await expect(trailer).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=hOrAsPtBr01',
    )
    await expect(trailer).toHaveAttribute('target', '_blank')
    await expect(canvasElement.querySelector('iframe')).toBeNull()
  },
}

/** TMDB has no official trailer in pt-BR or English: no link. */
export const WithoutTrailer: Story = {
  args: { film: { ...FILM, trailer: undefined } },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole('link', { name: 'trailer' }),
    ).toBeNull()
  },
}

export const WithoutPredictedRating: Story = {
  args: { film: { ...FILM, predictedRatings: [] } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText(/^previsto/)).toBeNull()
  },
}

/** Iara has no Fato but has a Nota prevista: she is in the line too. */
export const WithoutFactWithPrediction: Story = {
  args: {
    film: {
      ...BET!,
      predictedRatings: [
        { person: 'bruno', value: 7.12, text: '7,1', raters: 4 },
        { person: 'iara', value: 6.94, text: '6,9', raters: 1 },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('button', {
        name: 'Iara: pela nota de 1 pessoa de gosto parecido',
      }),
    ).toBeVisible()
    await expect(
      canvas.getByText('Iara: sem fato sobre este filme'),
    ).toBeVisible()
  },
}

/** Six Presentes, five with a Nota prevista (one of them a 10,0): the line
 * wraps inside the card and none spills out of it. */
export const ManyPresentes: Story = {
  args: {
    people: SIX,
    film: {
      ...FILM,
      withoutFact: ['quim'],
      coverage: 'Fato sobre 5 de 6',
      predictedRatings: [
        { person: 'bruno', value: 8.31, text: '8,3', raters: 12 },
        { person: 'iara', value: 10, text: '10,0', raters: 3 },
        { person: 'caio', value: 7.06, text: '7,1', raters: 8 },
        { person: 'quim', value: 6.44, text: '6,4', raters: 2 },
        { person: 'teo', value: 9.15, text: '9,2', raters: 25 },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const names = canvas.getAllByRole('button', { name: /gosto parecido/ })
    await expect(names).toHaveLength(5)
    const card = canvasElement.querySelector('article')!.getBoundingClientRect()
    for (const name of names) {
      const box = name.getBoundingClientRect()
      await expect(box.left).toBeGreaterThanOrEqual(card.left)
      await expect(box.right).toBeLessThanOrEqual(card.right)
    }
  },
}
