// The rating screen: one film of the Fila de Notas at a time, with what
// each tap did, the bar with Pronto, the search that picks another, and
// what Pronto wrote.
import type { FilmCard, RatingQueue } from '@filmes/engine'
import type { Meta, StoryObj } from '@storybook/react-vite'
import type { ComponentProps } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { RatingScreen } from './ratings'
import { RATINGS } from './ratings.copy'

// The screen's own prop: the story leaves the server module alone.
type SearchAnswer = NonNullable<ComponentProps<typeof RatingScreen>['search']>

const QUEUE: RatingQueue = {
  person: 'teo',
  rated: 3,
  films: [
    {
      id: 'tt9000601',
      title: 'Pequenos Milagres',
      year: 2019,
      genres: ['Comédia', 'Drama'],
      directors: ['Lia Couto'],
      runtime: 96,
    },
    {
      id: 'tt9000602',
      title: 'Casa Cheia',
      year: 2021,
      genres: [],
      directors: [],
      runtime: 102,
    },
    {
      id: 'tt9000701',
      title: 'Deserto Branco',
      year: 2015,
      genres: [],
      directors: [],
      runtime: 140,
    },
  ],
}

const CARD: FilmCard = {
  id: 'tt9000601',
  title: 'Pequenos Milagres',
  titlePt: null,
  year: 2019,
  runtime: 96,
  directors: ['Lia Couto'],
  poster: null,
  synopsis:
    'Num bairro que perdeu a padaria, a farmácia e o cinema, uma costureira aposentada resolve reabrir o cinema sozinha. Os vizinhos acham que ela enlouqueceu, até a primeira sessão.',
  attributions: [],
}

const SEARCH: SearchAnswer = {
  query: 'fronteira',
  found: {
    query: 'fronteira',
    films: [
      {
        id: 'tt9000401',
        title: 'Fronteira',
        year: 2008,
        votes: 40000,
        rating: 7.2,
        directors: ['Rui Tavares'],
      },
    ],
    people: [],
    genres: [],
    series: [],
  },
}

const meta = {
  component: RatingScreen,
  args: { queue: QUEUE, search: null },
  // Each story starts without the draft another one left.
  beforeEach: () => localStorage.clear(),
} satisfies Meta<typeof RatingScreen>

export default meta

type Story = StoryObj<typeof meta>

export const NextInQueue: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('heading', {
        level: 1,
        name: RATINGS.title,
      }),
    ).toBeVisible()
  },
}

/** With the card's synopsis, as the route's loader gives it. */
export const WithSynopsis: Story = {
  args: {
    loadCard: (id) => Promise.resolve(id === CARD.id ? CARD : null),
  },
}

/** A Nota given: its disc sticks on with "Voltar ao anterior", the next
 * film comes, and the bar counts it. */
export const AfterATap: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Nota 8' }))
    await expect(
      canvas.getByRole('button', {
        name: RATINGS.undoLabel('Pequenos Milagres'),
      }),
    ).toBeVisible()
    await expect(canvas.getByText(RATINGS.progress(4, 10))).toBeVisible()
  },
}

/** Ten reached: said once, the card behind "Continuar dando notas". */
export const GoalReached: Story = {
  args: { queue: { ...QUEUE, rated: 9 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Nota 8' }))
    await expect(canvas.getByText(RATINGS.goal(10))).toBeVisible()
  },
}

export const PickedInSearch: Story = {
  args: { search: SEARCH, film: 'tt9000401' },
}

/** A film she rated already, from the search or Meu gosto's "Mudar":
 * her Nota on the card and on the result (#274). */
export const AlreadyRated: Story = {
  args: { search: SEARCH, film: 'tt9000401', rated: { tt9000401: 10 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(RATINGS.ratedNow(10))).toBeVisible()
    await expect(canvas.getByText(/sua nota 10/)).toBeVisible()
  },
}

/** After Pronto: no bar, "Pedir filme" is the one orange button (#274). */
export const Written: Story = {
  args: { written: 3, queue: { ...QUEUE, rated: 12 } },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole('region', { name: RATINGS.bar }),
    ).toBeNull()
  },
}

export const Refused: Story = { args: { refusal: 'pedido' } }

export const Unavailable: Story = { args: { queue: null } }
