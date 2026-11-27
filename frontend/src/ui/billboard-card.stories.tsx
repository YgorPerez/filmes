// One film of the Cartaz: with a poster and marks, a bet without poster,
// marked Trocar or Já vi, and read-only once the Session has its Feedback;
// the Nota prevista line under "Por que" with and without a prediction, a
// Presente without a Fato with a number, and six Presentes on a phone; the
// Trocar the Já vi and the stars turn on (#326); the trailer link, and a
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
  swapByHand: false,
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
    // No dot or number on the case, no "novo" anywhere (#326).
    await expect(canvas.queryByText(/^novo$/i)).toBeNull()
  },
}

export const Bet: Story = {
  args: { film: BET!, first: false },
  render: (args) => <Marked {...args} />,
}

export const Swapped: Story = {
  args: { marks: { ...NO_MARKS, swap: true, swapByHand: true } },
  render: (args) => <Marked {...args} />,
}

/** Only Iara saw it: the cover takes JÁ VI with her initial (#272). */
export const OneSeen: Story = {
  args: { marks: { ...NO_MARKS, seen: ['iara'] } },
  render: (args) => <Marked {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Já vi: Iara')).toBeInTheDocument()
    // Without Sem Já visto, a Já vi leaves the Trocar alone.
    await expect(
      canvas.getByRole('button', { name: 'Trocar' }),
    ).toHaveAttribute('aria-pressed', 'false')
  },
}

/** With Sem Já visto, a Já vi turns the Trocar on and says why; the Dono
 * can turn it off, and then it is hers (#326). */
export const SeenTurnsSwapOn: Story = {
  args: { unseen: true },
  render: (args) => <Marked {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const swap = canvas.getByRole('button', { name: 'Trocar' })
    await userEvent.click(canvas.getByRole('button', { name: 'Iara' }))
    await expect(swap).toHaveAttribute('aria-pressed', 'true')
    await expect(
      canvas.getByText('Trocar marcado: Iara já viu'),
    ).toBeInTheDocument()
    await userEvent.click(swap)
    await expect(swap).toHaveAttribute('aria-pressed', 'false')
    await expect(canvas.queryByText(/^Trocar marcado/)).toBeNull()
    await userEvent.click(canvas.getByRole('button', { name: 'Você' }))
    await expect(swap).toHaveAttribute('aria-pressed', 'false')
  },
}

/** 1 to 3 stars turn the Trocar on; 4 or more turn it off again (#326). */
export const LowStarsTurnSwapOn: Story = {
  render: (args) => <Marked {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const swap = canvas.getByRole('button', { name: 'Trocar' })
    await userEvent.click(canvas.getByRole('button', { name: '2 de 5' }))
    await expect(swap).toHaveAttribute('aria-pressed', 'true')
    await expect(
      canvas.getByText('Trocar marcado: 2 estrelas'),
    ).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: '4 de 5' }))
    await expect(swap).toHaveAttribute('aria-pressed', 'false')
  },
}

/** Kept from the last version with 4 stars and a comment: the stars are
 * in their controls, once, and the comment stays in sight (#272). */
export const Kept: Story = {
  args: {
    film: {
      ...FILM,
      notes: { stars: 4, comments: ['a Iara riu do trailer'] },
    },
  },
  render: (args) => <Marked {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('button', { name: '4 de 5' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas.queryByRole('img', { name: /estrelas/ })).toBeNull()
    await expect(canvas.getByText('a Iara riu do trailer')).toBeVisible()
  },
}

/** Once told: the past tense, and the stars given say "4 de 5". A tap on
 * Bruno's Nota prevista opens who backs it, under it. */
export const ReadOnly: Story = {
  args: { film: { ...FILM, notes: { stars: 4, comments: [] } } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText('Por que estava na lista')).toBeVisible()
    await expect(canvas.getByText('4 de 5')).toBeVisible()
    const hint = 'pela nota de 12 pessoas de gosto parecido'
    const dot = canvas.getByRole('button', { name: /^Nota prevista de Bruno/ })
    await expect(dot).toHaveTextContent('Bruno 8,3')
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
    await expect(
      canvas.queryByRole('button', { name: /^Nota prevista de Iara/ }),
    ).toBeNull()
  },
}

export const UnderSection: Story = { args: { level: 3 } }

/** Every line is its section's and nobody has a Nota prevista: the card
 * has no "Por que" of its own (#272). */
export const NoReasonOfItsOwn: Story = {
  args: {
    level: 3,
    film: { ...FILM, lines: [], predictedRatings: [], withoutFact: ['iara'] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('Por que cada um vai gostar')).toBeNull()
    await expect(canvas.queryByRole('heading', { level: 4 })).toBeNull()
  },
}

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

/** The trailer opens YouTube in a new tab: a link, never a player. The
 * IMDb and trailer links are 44px tall (#272, #277). */
export const WithTrailer: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const trailer = canvas.getByRole('link', { name: 'trailer' })
    await expect(trailer).toHaveAttribute(
      'href',
      'https://www.youtube.com/watch?v=hOrAsPtBr01',
    )
    await expect(trailer).toHaveAttribute('target', '_blank')
    await expect(canvasElement.querySelector('iframe')).toBeNull()
    for (const link of [trailer, canvas.getByRole('link', { name: /IMDb/ })])
      await expect(link.getBoundingClientRect().height).toBeGreaterThanOrEqual(
        44,
      )
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
    const canvas = within(canvasElement)
    await expect(canvas.queryByText('previsto')).toBeNull()
    await expect(canvas.getByText('Por que estava na lista')).toBeVisible()
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
      canvas.getByRole('button', {
        name: 'Nota prevista de Iara: 6,9 de 10, pela nota de 1 pessoa de gosto parecido',
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
    const dots = canvas.getAllByRole('button', { name: /^Nota prevista/ })
    await expect(dots).toHaveLength(5)
    const card = canvas.getByRole('article').getBoundingClientRect()
    for (const dot of dots) {
      const box = dot.getBoundingClientRect()
      await expect(box.left).toBeGreaterThanOrEqual(card.left)
      await expect(box.right).toBeLessThanOrEqual(card.right)
    }
  },
}
