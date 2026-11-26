// @vitest-environment jsdom
// Contar como foi as the server sends it, before the JavaScript (#235):
// the search is a button that posts the form, and "Usar" a link to the
// page with the film, keeping the note of what was filled. The browser
// side of it, with the JavaScript off, is `e2e/feedback.e2e.ts`.
import { renderToString } from 'react-dom/server'
import { expect, it } from 'vite-plus/test'
import type { FeedbackPage } from '#/platform/feedback'
import { CATALOG_SEARCH } from './catalog-search.copy'
import { FeedbackScreen } from './feedback'

const PAGE: FeedbackPage = {
  id: '2026-11-20-iara',
  date: '2026-11-20',
  request: null,
  attendees: [{ person: 'bruno', name: 'Bruno', owner: true }],
  moods: [],
  constraints: [],
  recommendation: [{ position: 1, id: 'tt9000101', title: 'O Farol de Areia' }],
  satisfaction: [],
}

const SEARCH = {
  query: 'cheia',
  found: {
    query: 'cheia',
    films: [
      {
        id: 'tt9000602',
        title: 'Casa Cheia',
        year: 2021,
        votes: 50000,
        rating: null,
        directors: [],
      },
    ],
    people: [],
    genres: [],
    series: [],
  },
}

it('posts the search and links each “Usar”, before the JavaScript', () => {
  const doc = new DOMParser().parseFromString(
    renderToString(
      <FeedbackScreen
        session={PAGE.id}
        page={PAGE}
        search={SEARCH}
        note="6f1c2a90-0000-4000-8000-000000000001"
      />,
    ),
    'text/html',
  )
  expect(doc.querySelector('button[name="buscar-catalogo"]')?.textContent).toBe(
    CATALOG_SEARCH.submit,
  )
  expect(
    doc
      .querySelector(
        `a[aria-label="${CATALOG_SEARCH.pickLabel('Casa Cheia (2021)')}"]`,
      )
      ?.getAttribute('href'),
  ).toBe(
    '/sessoes/2026-11-20-iara/contar?filme=tt9000602&buscar=cheia&nota=6f1c2a90-0000-4000-8000-000000000001',
  )
  // The search came back: "Outro filme" is marked, in the HTML itself.
  expect(
    doc.querySelector<HTMLInputElement>('input[name="filme"][value="outro"]')
      ?.checked,
  ).toBe(true)
})
