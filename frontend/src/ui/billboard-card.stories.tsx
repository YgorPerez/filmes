// One film of the Cartaz: with a poster and marks, a new bet without poster,
// marked Trocar, and read-only once the Session has its Feedback.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { BillboardCard } from './billboard-card'
import { MODEL } from './billboard.fixture'
import type { FilmMarks } from './billboard-marks'

// A poster drawn here, so no story reaches the network for TMDB's.
const POSTER =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 2 3'%3E%3Crect width='2' height='3' fill='%23476'/%3E%3C/svg%3E"

const [FIRST, BET] = MODEL.films
const FILM = { ...FIRST!, poster: POSTER }

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

export const ReadOnly: Story = {}

export const UnderSection: Story = { args: { level: 3 } }
