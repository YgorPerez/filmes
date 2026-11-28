// A film's full sheet (#377): the public facts and "Por que", as a guest
// (her own lines) and as the Dono (everyone's).
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import { FilmSheet } from './film-sheet'
import { GUEST_DECK, OWNER_DECK } from './session-votes.fixture'

const [film] = GUEST_DECK.films
if (!film) throw new Error('Expected a film in the fixture')
const named = {
  title: film.title,
  originalTitle: film.card?.originalTitle ?? null,
  poster: film.card?.poster ?? null,
}

const meta = {
  component: FilmSheet,
  args: {
    film: named,
    sheet: film.sheet,
    people: GUEST_DECK.people,
    onClose: () => {},
  },
} satisfies Meta<typeof FilmSheet>

export default meta

type Story = StoryObj<typeof meta>

export const Guest: Story = {
  play: async ({ canvasElement }) => {
    const dialog = within(
      within(canvasElement.ownerDocument.body).getByRole('dialog'),
    )
    await expect(dialog.getByText('Por que você vai gostar')).toBeVisible()
  },
}

export const Owner: Story = {
  args: {
    sheet: OWNER_DECK.films[0]?.sheet ?? null,
    people: OWNER_DECK.people,
  },
}

export const WithoutSheet: Story = { args: { sheet: null } }
