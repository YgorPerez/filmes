// @vitest-environment jsdom
// The Catálogo search card (#128): a plain GET form to the page itself,
// and the answer with the IDs to copy or to "Usar".
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vite-plus/test'
import type { SearchAnswer } from '#/platform/catalog-search'
import type { FeedbackPage } from '#/platform/feedback'
import { CATALOG_SEARCH } from './catalog-search.copy'
import { FeedbackScreen } from './feedback'
import { NewSession } from './sessions'

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
  recommendation: [],
  satisfaction: [],
}

const showFeedback = (search: SearchAnswer) =>
  render(<FeedbackScreen session={PAGE.id} page={PAGE} search={search} />)

const searchForm = () =>
  screen.getByRole('search', { name: CATALOG_SEARCH.title }) as HTMLFormElement

it('is a GET form to the page that keeps its other values', () => {
  render(
    <NewSession
      options={{
        people: [{ person: 'bruno', name: 'Bruno', owner: true }],
        moods: [],
      }}
      search={null}
      similar="tt1"
    />,
  )
  const form = searchForm()

  expect(form.method).toBe('get')
  expect(new URL(form.action).pathname).toBe('/sessoes/nova')
  expect([...new FormData(form).entries()]).toEqual([
    ['parecido', 'tt1'],
    ['buscar', ''],
  ])
  expect(screen.getByText(CATALOG_SEARCH.leadFilms)).toBeTruthy()
  expect(screen.queryByRole('status')).toBeNull()
})

it('shows each kind with its IDs, and "Usar" only on films', () => {
  showFeedback(FOUND)

  expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe(
    'fronteira',
  )
  expect(screen.getByText(CATALOG_SEARCH.leadFilms)).toBeTruthy()
  expect(screen.getByRole('status').textContent).toBe(
    CATALOG_SEARCH.results('fronteira'),
  )
  const films = screen.getByRole('heading', { name: 'Filmes' })
    .nextElementSibling as HTMLElement
  expect(within(films).getByText('Fronteira (2008)')).toBeTruthy()
  expect(within(films).getByText('tt9000401')).toBeTruthy()
  expect(within(films).getByText('Rui Tavares · 40.000 votos')).toBeTruthy()
  expect(within(films).getByText('Fronteira II')).toBeTruthy()
  expect(
    screen
      .getByRole('link', { name: 'Usar Fronteira (2008)' })
      .getAttribute('href'),
  ).toBe('/feedback/2026-11-20-bruno?filme=tt9000401&buscar=fronteira')
  expect(screen.getAllByRole('link', { name: /^Usar/ })).toHaveLength(2)
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
