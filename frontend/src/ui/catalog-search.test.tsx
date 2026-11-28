// @vitest-environment jsdom
// The Catálogo search card (#128): a plain GET form to the page itself,
// and the answer with the IDs to copy or to "Usar".
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vite-plus/test'
import type { SearchAnswer } from '#/platform/catalog-search'
import type { FeedbackPage } from '#/platform/feedback'
import { CATALOG_SEARCH } from './catalog-search.copy'
import { FeedbackScreen } from './feedback'
import { NewSession } from './new-session'

afterEach(cleanup)

const FOUND: SearchAnswer = {
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
      {
        id: 'tt9001903',
        title: 'Fronteira II',
        year: null,
        votes: 8000,
        rating: null,
        directors: [],
      },
    ],
    people: [
      {
        id: 'Q9000006',
        label: 'Lia Moura',
        links: ['director', 'cast'],
        filmCount: 2,
        knownFor: [{ id: 'tt9000601', title: 'Pequenos Milagres', year: 2019 }],
      },
    ],
    genres: [],
    series: [
      {
        id: 'Q9001903',
        label: 'Trilogia da Fronteira',
        links: ['series'],
        filmCount: 1,
        knownFor: [{ id: 'tt9000401', title: 'Fronteira', year: 2008 }],
      },
    ],
  },
}

// Through the screens that show it: the card lives in `person-parts.tsx`,
// at fallow's coupling limit, so no test imports it on its own.
const PAGE: FeedbackPage = {
  id: '2026-11-20-bruno',
  date: '2026-11-20',
  request: null,
  attendees: [{ person: 'bruno', name: 'Bruno', owner: true }],
  moods: [],
  constraints: [],
  additions: [],
  stars: {},
  earlier: [],
  recommendation: [],
  satisfaction: [],
}

const showFeedback = (search: SearchAnswer) =>
  render(<FeedbackScreen session={PAGE.id} page={PAGE} search={search} />)

it('puts the film lookup in the same form as the request', () => {
  render(
    <NewSession
      options={{
        people: [{ person: 'bruno', name: 'Bruno', owner: true }],
        moods: [],
        noMoods: [],
      }}
      search={null}
      similar="tt1"
    />,
  )
  const form = screen.getByRole('form', {
    name: 'Nova Sessão',
  }) as HTMLFormElement
  const lookup = screen.getByRole('region', { name: CATALOG_SEARCH.title })
  const search = within(lookup).getByRole('searchbox') as HTMLInputElement

  // With the JavaScript in, the search runs as the Dono types: no button.
  expect(search.form).toBe(form)
  expect(form.method).toBe('post')
  expect(within(lookup).queryByRole('button', { name: 'Buscar' })).toBeNull()
  expect(new FormData(form).get('parecido')).toBe('tt1')
  expect(screen.queryByRole('status')).toBeNull()
})

it('shows each kind with its IDs, and "Usar" only on films', () => {
  showFeedback(FOUND)

  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe(
    'fronteira',
  )
  expect(screen.getByRole('status').textContent).toBe(
    CATALOG_SEARCH.results('fronteira'),
  )
  const films = screen.getByRole('heading', { name: 'Filmes' })
    .nextElementSibling as HTMLElement
  expect(within(films).getByText('Fronteira (2008)')).toBeTruthy()
  expect(within(films).getByText('tt9000401')).toBeTruthy()
  expect(within(films).getByText('Rui Tavares · 40.000 votos')).toBeTruthy()
  expect(within(films).getByText('Fronteira II')).toBeTruthy()
  // With the JavaScript in, "Usar" takes the film in place: a button.
  expect(screen.getAllByRole('button', { name: /^Usar/ })).toHaveLength(2)
  expect(
    screen.getByText('direção, elenco · 2 filmes · Pequenos Milagres (2019)'),
  ).toBeTruthy()
  expect(screen.getByText('Q9001903')).toBeTruthy()
  expect(screen.getByText('série · 1 filme · Fronteira (2008)')).toBeTruthy()
  expect(screen.queryByRole('heading', { name: 'Gêneros' })).toBeNull()
})

it('says when nothing matched, and why there is no answer', () => {
  const empty: SearchAnswer = {
    query: 'zzz',
    found: { query: 'zzz', films: [], people: [], genres: [], series: [] },
  }
  showFeedback(empty)
  expect(screen.getByRole('status').textContent).toBe(CATALOG_SEARCH.none)

  cleanup()
  showFeedback({ query: 'é', refused: 'curta' })
  expect(screen.getByRole('alert').textContent).toContain(
    CATALOG_SEARCH.refusals.curta,
  )
})
