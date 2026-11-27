// @vitest-environment jsdom
// Contar como foi with the JavaScript in (#235): the form posts by
// `fetch`, a refusal shown on top in place, and "Usar" takes the film
// without leaving the page. The server's side is faked at its edges: the
// Catálogo search (a server function) and `fetch`, answering `{ to }` as
// `answerFetch` does.
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { parseFeedback } from '#/content/feedback-form'
import type { FeedbackPage } from '#/platform/feedback'
import { CATALOG_SEARCH } from './catalog-search.copy'
import { FEEDBACK } from './feedback.copy'
import { FeedbackScreen } from './feedback'

vi.mock('./kit/film-search', () => ({
  searchFilms: (query: string) =>
    Promise.resolve({
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
          {
            id: 'tt9000601',
            title: 'Pequenos Milagres',
            year: 2019,
            votes: 41000,
            rating: null,
            directors: ['Rui Campos'],
          },
        ],
        people: [],
        genres: [],
        series: [],
      },
    }),
}))

const PAGE: FeedbackPage = {
  id: '2026-11-20-iara',
  date: '2026-11-20',
  request: null,
  attendees: [
    { person: 'bruno', name: 'Bruno', owner: true },
    { person: 'iara', name: 'Iara', owner: false },
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
  satisfaction: [],
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const form = () =>
  screen.getByRole('form', { name: FEEDBACK.form.label }) as HTMLFormElement

const submit = () => screen.getByRole('button', { name: FEEDBACK.form.submit })

it('shows the refusal the post came back with on top, keeping the form', async () => {
  const answered = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      Response.json({ to: `/sessoes/${PAGE.id}/contar?erro=comentario` }),
    ),
  )
  vi.stubGlobal('fetch', answered)
  // jsdom lays nothing out: the alert scrolls into view in a browser.
  const scrolled = vi.fn<() => void>()
  Element.prototype.scrollIntoView = scrolled
  render(<FeedbackScreen session={PAGE.id} page={PAGE} />)
  const user = userEvent.setup()

  await user.click(screen.getByRole('radio', { name: /O Farol de Areia/ }))
  await user.type(screen.getByLabelText('Comentário: Iara'), 'dormiu')
  await user.click(submit())

  expect((await screen.findByRole('alert')).textContent).toBe(
    FEEDBACK.refusals.comentario,
  )
  expect(scrolled).toHaveBeenCalled()
  const [url, init] = answered.mock.calls[0] ?? []
  expect(url).toBe(form().action)
  expect(new Headers(init?.headers).get('x-filmes-fetch')).toBe('1')
  expect(
    (screen.getByLabelText('Comentário: Iara') as HTMLInputElement).value,
  ).toBe('dormiu')
  expect(
    (
      screen.getByRole('radio', {
        name: /O Farol de Areia/,
      }) as HTMLInputElement
    ).checked,
  ).toBe(true)
})

it('says it is recording while the post runs, and takes no second post', async () => {
  const answered = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}))
  vi.stubGlobal('fetch', answered)
  render(<FeedbackScreen session={PAGE.id} page={PAGE} />)
  const user = userEvent.setup()

  await user.click(screen.getByRole('radio', { name: /O Farol de Areia/ }))
  await user.click(submit())

  const recording = screen.getByRole('button', {
    name: FEEDBACK.form.submitting,
  }) as HTMLButtonElement
  expect(recording.disabled).toBe(true)
  form().requestSubmit()
  expect(answered).toHaveBeenCalledOnce()
})

it('goes to the Sessão the post closed, through the router', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json({ to: `/sessoes/${PAGE.id}?feito=contada` }),
      ),
    ),
  )
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <FeedbackScreen session={PAGE.id} page={PAGE} />,
    }),
    history: createMemoryHistory({
      initialEntries: [`/sessoes/${PAGE.id}/contar`],
    }),
  })
  render(<RouterProvider router={router} />)
  const user = userEvent.setup()

  await user.click(
    await screen.findByRole('radio', { name: /O Farol de Areia/ }),
  )
  await user.click(submit())

  await waitFor(() =>
    expect(router.state.location.href).toBe(
      `/sessoes/${PAGE.id}?feito=contada`,
    ),
  )
})

it('takes the film “Usar” picks in place, keeping what was filled', async () => {
  render(<FeedbackScreen session={PAGE.id} page={PAGE} />)
  const user = userEvent.setup()

  await user.click(screen.getByRole('radio', { name: FEEDBACK.form.other }))
  await user.click(
    within(
      screen.getByRole('radiogroup', {
        name: FEEDBACK.form.ratingLabel('Bruno'),
      }),
    ).getByRole('radio', { name: '8' }),
  )
  await user.type(screen.getByRole('searchbox'), 'mare')
  await user.click(
    await screen.findByRole('button', {
      name: CATALOG_SEARCH.pickLabel('Maré Baixa (2015)'),
    }),
  )

  expect(screen.getByText('Maré Baixa (2015)', { selector: 'p' })).toBeTruthy()
  expect(parseFeedback(new FormData(form()))).toEqual({
    ok: {
      film: 'tt9000102',
      reactions: [{ person: 'bruno', kind: 'rating', rating: '4' }],
    },
  })

  // Typing another title lets the film go.
  await user.type(screen.getByRole('searchbox'), 'x')
  expect(screen.queryByText('Maré Baixa (2015)', { selector: 'p' })).toBeNull()
})

it('marks the film of the list that “Usar” picks', async () => {
  render(<FeedbackScreen session={PAGE.id} page={PAGE} />)
  const user = userEvent.setup()

  await user.click(screen.getByRole('radio', { name: FEEDBACK.form.other }))
  await user.type(screen.getByRole('searchbox'), 'mare')
  await user.click(
    await screen.findByRole('button', {
      name: CATALOG_SEARCH.pickLabel('Pequenos Milagres (2019)'),
    }),
  )

  expect(
    (
      screen.getByRole('radio', {
        name: /Pequenos Milagres/,
      }) as HTMLInputElement
    ).checked,
  ).toBe(true)
  expect(parseFeedback(new FormData(form()))).toEqual({
    ok: { film: 'tt9000601', reactions: [] },
  })
})
