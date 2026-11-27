// One film of the Cartaz: with a poster and marks, a new bet without poster,
// marked Trocar, and read-only once the Session has its Feedback; the dots
// on the case with and without a Nota prevista, a hollow one with a number,
// and six Presentes on the 112px case of a phone; the trailer link, and a
// film without one.
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

export const NewBet: Story = {
  args: { film: BET!, first: false },
  render: (args) => <Marked {...args} />,
}

export const Swapped: Story = {
  args: { marks: { ...NO_MARKS, swap: true } },
  render: (args) => <Marked {...args} />,
}

/** Bruno has a Nota prevista, Iara none. */
/** Bruno has a Nota prevista, Iara none; a tap on his dot opens its hint
 * under it. */
export const ReadOnly: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const hint = 'Bruno: 8,3 de 10 · 12 vizinhos'
    const dot = canvas.getByRole('button', { name: hint })
    await expect(canvas.getByText(hint)).not.toBeVisible()
    await userEvent.click(dot)
    const popover = canvas.getByText(hint)
    await expect(popover).toBeVisible()
    const box = popover.getBoundingClientRect()
    await expect(box.top).toBeGreaterThanOrEqual(
      dot.getBoundingClientRect().bottom,
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
    await expect(
      within(canvasElement).queryByRole('button', { name: /vizinho/ }),
    ).toBeNull()
  },
}

/** Iara has no Fato but has a Nota prevista: a hollow dot with a number. */
export const HollowWithNumber: Story = {
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
      canvas.getByRole('button', { name: 'Iara: 6,9 de 10 · 1 vizinho' }),
    ).toBeVisible()
    await expect(
      canvas.getByText('Iara: sem fato sobre este filme'),
    ).toBeVisible()
  },
}

/** Six Presentes, five with a Nota prevista (one of them a 10,0): the dots
 * wrap inside the case and none spills out of it. */
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
    const dots = canvas.getAllByRole('button', { name: /vizinho/ })
    await expect(dots).toHaveLength(5)
    // The link fills the cover, which sits in the case.
    const cover = canvas.getByRole('link', { name: /^Capa/ })
    const tape = cover.parentElement!.parentElement!.getBoundingClientRect()
    for (const dot of dots) {
      const box = dot.getBoundingClientRect()
      await expect(box.left).toBeGreaterThanOrEqual(tape.left)
      await expect(box.right).toBeLessThanOrEqual(tape.right)
      await expect(box.bottom).toBeLessThanOrEqual(tape.bottom)
    }
  },
}
