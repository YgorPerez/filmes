// The resolution queue: each film that waits, with TMDB's suggestions
// (poster and synopsis), the Catálogo search, the link and the reasons to
// take it out; and what the last decision did, with Desfazer.
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
          poster: null,
          overview:
            'Um faroleiro e a filha esperam o vento que traz o barco do irmão, que não volta há dez anos.',
        },
        {
          tmdb: '9103',
          title: 'Vento Norte',
          originalTitle: 'Nordwind',
          year: 2020,
          link: 'https://www.themoviedb.org/movie/9103',
          poster: null,
          overview:
            'Ein Segler verliert auf der Nordsee den Kurs und findet eine Insel.',
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
  args: {
    done: {
      notice: 'confirmado',
      item: 'vento-norte-2020-e2bf439e1af6',
      title: 'Vento Norte (2020)',
    },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', {
        name: 'Desfazer a decisão sobre Vento Norte (2020)',
      }),
    ).toBeVisible()
  },
}

/** A film's card with the Catálogo search it asked for open. */
export const SearchedInCatalog: Story = {
  args: {
    search: {
      item: 'filme-perdido-2001-91d7fc73cdee',
      answer: {
        query: 'perdido',
        found: {
          query: 'perdido',
          films: [
            {
              id: 'tt9000303',
              title: 'O Filme Perdido',
              year: 2001,
              votes: 3000,
              rating: 7.1,
              directors: ['Ana Reis'],
            },
          ],
          people: [],
          genres: [],
          series: [],
        },
      },
    },
  },
}

export const Refused: Story = { args: { refusal: 'filme' } }

export const Empty: Story = {
  args: { queue: { items: [], names: {}, attributions: [] } },
}

export const Unavailable: Story = { args: { queue: null } }
