// @vitest-environment jsdom
// Nova Sessão as the server sends it, before the JavaScript (#235): the
// search is a button that posts the form, "Usar" a link to the page with
// the film, and "Parecido com" a field of ids. The browser side of it,
// with the JavaScript off, is `e2e/catalog-search.e2e.ts`.
import { renderToString } from 'react-dom/server'
import { expect, it } from 'vite-plus/test'
import { CATALOG_SEARCH } from './catalog-search.copy'
import { NewSession } from './new-session'
import { SESSIONS } from './sessions.copy'

const OPTIONS = {
  people: [{ person: 'bruno', name: 'Bruno', owner: true }],
  moods: [],
  noMoods: [],
}

const SEARCH = {
  query: 'mare',
  found: {
    query: 'mare',
    films: [
      {
        id: 'tt9000102',
        title: 'Maré Baixa',
        year: 2015,
        votes: 32000,
        rating: null,
        directors: ['Helena Prado'],
      },
    ],
    people: [],
    genres: [],
    series: [],
  },
}

const page = (html: string) =>
  new DOMParser().parseFromString(html, 'text/html')

it('posts the search and links each “Usar”, before the JavaScript', () => {
  const doc = page(
    renderToString(
      <NewSession
        options={OPTIONS}
        search={SEARCH}
        similar="tt9000101"
        note="6f1c2a90-0000-4000-8000-000000000001"
      />,
    ),
  )
  const search = doc.querySelector<HTMLButtonElement>(
    'button[name="buscar-catalogo"]',
  )
  expect(search?.textContent).toBe(CATALOG_SEARCH.submit)
  expect(
    doc
      .querySelector(
        `a[aria-label="${CATALOG_SEARCH.pickLabel('Maré Baixa (2015)')}"]`,
      )
      ?.getAttribute('href'),
  ).toBe(
    '/sessoes/nova?parecido=tt9000101%2Ctt9000102&buscar=mare&nota=6f1c2a90-0000-4000-8000-000000000001',
  )
  const similar = doc.querySelector<HTMLInputElement>(
    'input[type="text"][name="parecido"]',
  )
  expect(similar?.value).toBe('tt9000101')
  expect(doc.body.textContent).toContain(SESSIONS.form.similarHint)
})
