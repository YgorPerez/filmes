// @vitest-environment jsdom
// Nova Sessão with the JavaScript in (#235): the search runs as the Dono
// types, and the form posts by `fetch`, a refusal shown in place. The
// server's side is faked at its edges: the Catálogo search (a server
// function) and `fetch`, answering `{ to }` as `answerFetch` does.
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'
import { CATALOG_SEARCH } from './catalog-search.copy'
import { POST_FAILED } from './kit/status'
import { NewSession } from './new-session'
import { SESSIONS } from './sessions.copy'

const searched = vi.hoisted(() => [] as string[])

vi.mock('./kit/film-search', () => ({
  searchFilms: (query: string) => {
    searched.push(query)
    // An id the fake server fails on, as a server down.
    if (query === 'tt0000000') return Promise.reject(new Error('down'))
    return Promise.resolve({
      query,
      found: {
        query,
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
    })
  },
}))

const OPTIONS = {
  people: [{ person: 'bruno', name: 'Bruno', owner: true }],
  moods: [],
  noMoods: [],
}

beforeEach(() => {
  searched.length = 0
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const form = () =>
  screen.getByRole('form', { name: SESSIONS.form.label }) as HTMLFormElement

it('searches a whole IMDb id as it is typed, and Enter there sends nothing', async () => {
  render(<NewSession options={OPTIONS} />)
  const user = userEvent.setup()
  const sent = vi.fn<(event: SubmitEvent) => void>()
  form().addEventListener('submit', sent)

  await user.click(screen.getByText(SESSIONS.form.searchFold))
  await user.type(screen.getByRole('searchbox'), 'tt9000102{Enter}')

  expect(
    await screen.findByRole('button', { name: 'Usar Maré Baixa (2015)' }),
  ).toBeTruthy()
  expect(searched).toEqual(['tt9000102'])
  expect(sent).not.toHaveBeenCalled()
  // What the field holds is searched already: Enter elsewhere opens the
  // Session, not a search (`searchAsked`).
  expect(new FormData(form()).get('buscado')).toBe('tt9000102')
  expect(
    screen.queryByRole('button', { name: CATALOG_SEARCH.submit }),
  ).toBeNull()
})

it('shows the refusal the post came back with, keeping the form', async () => {
  const answered = vi.fn<typeof fetch>(() =>
    Promise.resolve(Response.json({ to: '/sessoes/nova?erro=presentes' })),
  )
  vi.stubGlobal('fetch', answered)
  // jsdom lays nothing out: the alert scrolls into view in a browser.
  const scrolled = vi.fn<() => void>()
  Element.prototype.scrollIntoView = scrolled
  render(<NewSession options={OPTIONS} />)
  const user = userEvent.setup()

  await user.click(screen.getByRole('checkbox', { name: /^Bruno/ }))
  await user.click(screen.getByRole('button', { name: SESSIONS.form.submit }))

  expect((await screen.findByRole('alert')).textContent).toContain(
    SESSIONS.refusals.presentes,
  )
  expect(scrolled).toHaveBeenCalled()
  const [url, init] = answered.mock.calls[0] ?? []
  expect(url).toBe(form().action)
  expect(new Headers(init?.headers).get('x-filmes-fetch')).toBe('1')
  expect(
    (screen.getByRole('checkbox', { name: /^Bruno/ }) as HTMLInputElement)
      .checked,
  ).toBe(false)
})

it('names the films that came by id, and searches nothing under 2 letters', async () => {
  render(<NewSession options={OPTIONS} similar="tt9000102" />)
  const user = userEvent.setup()

  expect(
    await screen.findByRole('button', {
      name: CATALOG_SEARCH.remove('Maré Baixa (2015)'),
    }),
  ).toBeTruthy()
  expect(searched).toEqual(['tt9000102'])
  await user.type(screen.getByRole('searchbox'), 'm')
  expect(searched).toEqual(['tt9000102'])
})

it('says it is reading while “Ler” runs, and takes no second post', async () => {
  const answered = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}))
  vi.stubGlobal('fetch', answered)
  render(<NewSession options={OPTIONS} />)
  const user = userEvent.setup()

  await user.click(screen.getByRole('button', { name: SESSIONS.form.read }))
  const reading = screen.getByRole('button', {
    name: SESSIONS.form.reading.busy,
  }) as HTMLButtonElement
  expect(reading.disabled).toBe(true)
  expect(
    (
      screen.getByRole('button', {
        name: SESSIONS.form.submit,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true)
  form().requestSubmit()
  expect(answered).toHaveBeenCalledOnce()
})

it.each([
  [
    'answers another thing',
    () => Promise.resolve(new Response('Origem recusada', { status: 403 })),
  ],
  ['cannot be reached', () => Promise.reject(new TypeError('offline'))],
])('says so, sending nothing again, when the route %s', async (_, answer) => {
  const answered = vi.fn<typeof fetch>(answer)
  vi.stubGlobal('fetch', answered)
  // The plain post would be the form's own submit(): it must not run, as
  // the server may have done the post already.
  const plain = vi
    .spyOn(HTMLFormElement.prototype, 'submit')
    .mockImplementation(() => {})
  render(<NewSession options={OPTIONS} />)
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: SESSIONS.form.read }))

  expect((await screen.findByRole('alert')).textContent).toBe(POST_FAILED)
  expect(answered).toHaveBeenCalledOnce()
  expect(plain).not.toHaveBeenCalled()
  plain.mockRestore()
})

it('says the search failed when the server fails it', async () => {
  render(<NewSession options={OPTIONS} />)
  await userEvent.setup().type(screen.getByRole('searchbox'), 'tt0000000')

  expect((await screen.findByRole('alert')).textContent).toBe(
    CATALOG_SEARCH.refusals.indisponivel,
  )
})

it('goes to the Session the post opened, through the router', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json({ to: '/sessoes/2026-11-20-bruno?feito=aberta' }),
      ),
    ),
  )
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <NewSession options={OPTIONS} />,
    }),
    history: createMemoryHistory({ initialEntries: ['/sessoes/nova'] }),
  })
  render(<RouterProvider router={router} />)

  await userEvent
    .setup()
    .click(await screen.findByRole('button', { name: SESSIONS.form.submit }))

  await waitFor(() =>
    expect(router.state.location.href).toBe(
      '/sessoes/2026-11-20-bruno?feito=aberta',
    ),
  )
})

it('keeps the id of a film it cannot name', async () => {
  render(<NewSession options={OPTIONS} similar="tt0000000" />)
  await waitFor(() => expect(searched).toEqual(['tt0000000']))
  expect(
    screen.getByRole('button', { name: CATALOG_SEARCH.remove('tt0000000') }),
  ).toBeTruthy()
})
