// The Feedback form of a Session: as it opens, with a Catálogo search, with
// "outro filme" picked, refused, unknown and without the engine.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, within } from 'storybook/test'
import type { FeedbackPage } from '#/platform/feedback'
import { FEEDBACK } from './feedback.copy'
import { FeedbackScreen } from './feedback'

const PAGE: FeedbackPage = {
  id: '2026-11-20-iara-quim',
  date: '2026-11-20',
  request: 'algo leve',
  attendees: [
    { person: 'bruno', name: 'Bruno', owner: true },
    { person: 'iara', name: 'Iara', owner: false },
    { person: 'quim', name: 'Quim', owner: false },
  ],
  moods: [],
  constraints: [],
  additions: [],
  stars: {},
  earlier: [],
  recommendation: [
    { position: 1, id: 'tt9000101', title: 'O Farol de Areia' },
    { position: 2, id: 'tt9000601', title: 'Pequenos Milagres' },
  ],
  satisfaction: [
    { person: 'bruno', name: 'Bruno', satisfaction: 1, line: null },
    {
      person: 'iara',
      name: 'Iara',
      satisfaction: 0.1111,
      line: 'Iara: satisfação de 11% nas últimas Sessões (a mais alta do grupo, 100%); na de qui, 19 nov, deu 2 de 10 a Casa Cheia',
    },
    { person: 'quim', name: 'Quim', satisfaction: 1, line: null },
  ],
}

const meta = {
  component: FeedbackScreen,
  args: { session: PAGE.id, page: PAGE },
} satisfies Meta<typeof FeedbackScreen>

export default meta

type Story = StoryObj<typeof meta>

export const Open: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('form', { name: FEEDBACK.form.label }),
    ).toBeVisible()
    // The reactions show once a film is picked.
    await userEvent.click(
      canvas.getByRole('radio', { name: /O Farol de Areia/ }),
    )
    await expect(canvas.getByRole('group', { name: 'Iara' })).toBeVisible()
  },
}

/** What the Cartaz knew (#272): the starred film comes chosen, with its
 * stars, and the films that left the shelf are there too. */
export const FromTheCartaz: Story = {
  args: {
    page: {
      ...PAGE,
      additions: ['chegou a Rosa'],
      stars: { [PAGE.recommendation[1]!.id]: 4 },
      earlier: [{ id: 'tt9001106', title: 'Sessão Maldita' }],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      canvas.getByRole('radio', {
        name: new RegExp(PAGE.recommendation[1]!.title),
      }),
    ).toBeChecked()
    await expect(canvas.getByText(FEEDBACK.form.earlier)).toBeVisible()
    await expect(canvas.getByText('+ chegou a Rosa')).toBeVisible()
  },
}

export const WithSearch: Story = {
  args: {
    search: {
      query: 'cheia',
      found: {
        query: 'cheia',
        films: [
          {
            id: 'tt9000602',
            title: 'Casa Cheia',
            year: 2021,
            votes: 12000,
            rating: null,
            directors: ['Helena Prado'],
          },
        ],
        people: [],
        genres: [],
        series: [],
      },
    },
  },
}

export const OtherFilm: Story = { args: { film: 'tt9000602' } }

export const Refused: Story = { args: { refusal: 'filme' } }

export const Unknown: Story = { args: { session: 'x', page: 'unknown' } }

export const Unavailable: Story = { args: { session: 'x', page: null } }
