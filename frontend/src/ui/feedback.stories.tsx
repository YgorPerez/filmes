// The Feedback form of a Session: as it opens, with a Catálogo search, with
// "outro filme" picked, refused, unknown and without the engine.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
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
      line: 'satisfação de Iara nas últimas Sessões: 11%, e a mais alta do grupo, 100%; na de 2026-11-19 (Casa Cheia), deu 1',
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
    await expect(canvas.getByLabelText('Reação: Iara')).toBeVisible()
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
