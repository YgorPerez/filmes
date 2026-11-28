// Her Ordem (#379): the sim films with the tape and the handle, the one
// she wants most first, and the sheet with its Não.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { VOTES } from './session-votes.copy'
import { GUEST_FILMS, IARA_SEES } from './session-votes.fixture'
import { moved } from './vote-order'
import { VoteRanking } from './vote-ranking'

function Ranking({ sending = false }: { sending?: boolean }) {
  const [films, setFilms] = useState(GUEST_FILMS)
  return (
    <form className="flex flex-col gap-lg">
      <VoteRanking
        films={films}
        people={IARA_SEES}
        sending={sending}
        move={(from, to) => setFilms((f) => moved(f, from, to))}
        drop={(id) => setFilms((f) => f.filter((film) => film.id !== id))}
        back={() => undefined}
      />
    </form>
  )
}

const meta = {
  component: Ranking,
} satisfies Meta<typeof Ranking>

export default meta

type Story = StoryObj<typeof meta>

export const Order: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('heading', { name: VOTES.rankTitle }),
    ).toBeVisible()
    canvas
      .getByRole('button', { name: VOTES.rankMove('Noite de Estreia', 3, 3) })
      .focus()
    await userEvent.keyboard('{ArrowUp}')
    await expect(
      canvas.getByRole('button', {
        name: VOTES.rankMove('Noite de Estreia', 2, 3),
      }),
    ).toBeVisible()
  },
}

/** The sheet of a film, opened from its row, with the swipe's não. */
export const Sheet: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      canvas.getByRole('button', { name: '2. Pequenos Milagres' }),
    )
    const page = within(canvasElement.ownerDocument.body)
    await expect(page.getByRole('button', { name: VOTES.rankNo })).toBeVisible()
  },
}

export const Sending: Story = { args: { sending: true } }
