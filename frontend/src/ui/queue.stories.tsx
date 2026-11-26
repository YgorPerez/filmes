// The resolution queue: each film that waits, with TMDB's suggestions and
// the forms to confirm or discard it.
import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import type { QueuePage } from '#/platform/imports'
import { QueueScreen } from './queue'

const QUEUE_PAGE: QueuePage = {
  items: [
    {
      id: 'filme-perdido-2001-91d7fc73cdee',
      name: 'Filme Perdido',
      year: 2001,
      reason: 'nem o Wikidata nem o TMDB acharam o filme',
      people: ['quim', 'olga'],
      candidates: [],
    },
    {
      id: 'vento-norte-2020-e2bf439e1af6',
      name: 'Vento Norte',
      year: 2020,
      reason: 'o TMDB achou mais de um filme com esse título',
      people: ['quim'],
      candidates: [
        {
          tmdb: '9102',
          title: 'Vento Norte',
          originalTitle: null,
          year: 2020,
          link: 'https://www.themoviedb.org/movie/9102',
        },
        {
          tmdb: '9103',
          title: 'Vento Norte',
          originalTitle: 'Nordwind',
          year: 2020,
          link: 'https://www.themoviedb.org/movie/9103',
        },
      ],
    },
  ],
  names: { quim: 'Quim' },
  attributions: [
    {
      source: 'TMDB',
      text: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
    },
  ],
}

const meta = {
  component: QueueScreen,
  args: { queue: QUEUE_PAGE },
} satisfies Meta<typeof QueueScreen>

export default meta

type Story = StoryObj<typeof meta>

export const Waiting: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('region', { name: 'Vento Norte (2020)' }),
    ).toBeVisible()
  },
}

export const Confirmed: Story = {
  args: { done: { notice: 'confirmado', resolved: 2, left: 1 } },
}

export const Refused: Story = { args: { refusal: 'filme' } }

export const Empty: Story = {
  args: { queue: { items: [], names: {}, attributions: [] } },
}

export const Unavailable: Story = { args: { queue: null } }
