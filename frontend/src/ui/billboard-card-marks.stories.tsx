// The marks under a film: Já vi per Presente with a Nota and what each
// thought, Trocar, the stars and the comment.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { FilmMarksControls } from './billboard-card-marks'
import { MODEL } from './billboard.fixture'
import type { FilmMarks } from './billboard-marks'

const NO_MARKS: FilmMarks = {
  seen: [],
  ratings: {},
  thoughts: {},
  swap: false,
  stars: 0,
  comment: '',
}

/** The controls with their marks held here, as the Cartaz holds them. */
function Held(props: Parameters<typeof FilmMarksControls>[0]) {
  const [marks, setMarks] = useState(props.marks)
  return <FilmMarksControls {...props} marks={marks} onChange={setMarks} />
}

const meta = {
  component: FilmMarksControls,
  args: {
    film: MODEL.films[0]!,
    people: MODEL.attendees,
    marks: NO_MARKS,
    onChange: () => undefined,
  },
  render: (args) => <Held {...args} />,
} satisfies Meta<typeof FilmMarksControls>

export default meta

type Story = StoryObj<typeof meta>

export const Unmarked: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const star = canvas.getByRole('button', { name: '3 de 5' })
    await userEvent.click(star)
    await expect(star).toHaveAttribute('aria-pressed', 'true')
  },
}

export const SeenWithRatings: Story = {
  args: {
    marks: {
      ...NO_MARKS,
      seen: ['bruno', 'iara'],
      ratings: { bruno: '8', iara: '6' },
      thoughts: { iara: 'lento no meio' },
    },
  },
}

export const StarsAndComment: Story = {
  args: {
    marks: { ...NO_MARKS, stars: 4, comment: 'parece bom pra domingo' },
  },
}

export const AloneOwner: Story = {
  args: { people: MODEL.attendees.slice(0, 1) },
}
