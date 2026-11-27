// @vitest-environment jsdom
// A Pessoa's imports with the JavaScript in (#240): each form posts by
// `fetch`, the page goes where
// the route answers through the router, and a form that went through is
// emptied, as the reload emptied it. The server's side is faked at its
// edge, `fetch`, answering `{ to }` as `answerFetch` does.
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
  useSearch,
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
import { PERSON_IMPORTS } from './imports.copy'
import { importsSearch } from '#/content/imports-search'
import { PersonImportsScreen, type PersonImportsView } from './person-imports'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const COPY = PERSON_IMPORTS
const NONE = { wikidata: 0, tmdb: 0, manual: 0 }
const OWN: PersonImportsView = {
  person: 'bruno',
  own: true,
  name: 'Bruno',
  imports: [],
  letterboxd: {
    person: 'bruno',
    films: 0,
    resolved: NONE,
    discarded: NONE,
    queued: 0,
    queue: [],
    discardedItems: [],
  },
  trakt: { ratings: 0, seen: 0, watchlist: 0 },
  imdb: { ratings: 0 },
  simkl: { ratings: 0, seen: 0, watchlist: 0 },
}

/** The screen under a router, reading its query as its route. */
function renderRouted() {
  const router = createRouter({
    routeTree: createRootRoute({
      component: function Imports() {
        const { feito, erro, novos, fora } = importsSearch(
          useSearch({ strict: false }),
        )
        return (
          <PersonImportsScreen
            slug="bruno"
            page={OWN}
            done={feito && { notice: feito, facts: novos ?? 0, outside: fora }}
            refusal={erro}
          />
        )
      },
    }),
    history: createMemoryHistory({ initialEntries: ['/meu-gosto/importar'] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

const rssForm = async () =>
  within(await screen.findByRole('form', { name: COPY.rss.title }))

it('imports the profile by fetch, says what came, and empties the form', async () => {
  const answered = vi.fn<typeof fetch>(() =>
    Promise.resolve(
      Response.json({ to: '/meu-gosto/importar?feito=rss&novos=3' }),
    ),
  )
  vi.stubGlobal('fetch', answered)
  const scrolled = vi.fn<() => void>()
  Element.prototype.scrollIntoView = scrolled
  const router = renderRouted()
  const user = userEvent.setup()
  const rss = await rssForm()
  const field = rss.getByLabelText(COPY.rss.user, { exact: false })

  await user.type(field, 'bruno')
  await user.click(rss.getByRole('button', { name: COPY.rss.submit }))

  expect((await screen.findByRole('status')).textContent).toBe(
    COPY.notices.rss(3),
  )
  expect(router.state.location.href).toBe(
    '/meu-gosto/importar?feito=rss&novos=3',
  )
  expect(scrolled).toHaveBeenCalled()
  const [url, init] = answered.mock.calls[0] ?? []
  expect(url).toMatch(/\/importar\/bruno\/acao$/)
  expect(new Headers(init?.headers).get('x-filmes-fetch')).toBe('1')
  expect((init?.body as FormData | undefined)?.get('usuario')).toBe('bruno')
  expect((field as HTMLInputElement).value).toBe('')
})

it('brings the notice into view again when a second import says the same', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json({ to: '/meu-gosto/importar?feito=rss&novos=3' }),
      ),
    ),
  )
  const scrolled = vi.fn<() => void>()
  Element.prototype.scrollIntoView = scrolled
  renderRouted()
  const user = userEvent.setup()
  const rss = await rssForm()
  const field = rss.getByLabelText(COPY.rss.user, { exact: false })

  await user.type(field, 'bruno')
  await user.click(rss.getByRole('button', { name: COPY.rss.submit }))
  await waitFor(() => expect(scrolled).toHaveBeenCalledOnce())
  await user.type(field, 'bruno')
  await user.click(rss.getByRole('button', { name: COPY.rss.submit }))

  await waitFor(() => expect(scrolled).toHaveBeenCalledTimes(2))
})

it('keeps the profile typed when the post is refused', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ to: '/meu-gosto/importar?erro=rss' })),
    ),
  )
  Element.prototype.scrollIntoView = () => {}
  renderRouted()
  const user = userEvent.setup()
  const rss = await rssForm()
  const field = rss.getByLabelText(COPY.rss.user, { exact: false })

  await user.type(field, 'ninguem')
  await user.click(rss.getByRole('button', { name: COPY.rss.submit }))

  expect((await screen.findByRole('alert')).textContent).toContain(
    COPY.refusals.rss,
  )
  expect((field as HTMLInputElement).value).toBe('ninguem')
})

// The upload's own post, the ZIP in it, runs in `e2e/imports.e2e.ts`:
// jsdom does not send a file field userEvent filled.
it('says it is reading while the profile import runs, and takes no second post', async () => {
  const answered = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}))
  vi.stubGlobal('fetch', answered)
  renderRouted()
  const user = userEvent.setup()
  const rss = await rssForm()

  await user.type(rss.getByLabelText(COPY.rss.user, { exact: false }), 'b')
  await user.click(rss.getByRole('button', { name: COPY.rss.submit }))

  const reading = rss.getByRole('button', {
    name: COPY.rss.busy,
  }) as HTMLButtonElement
  expect(reading.disabled).toBe(true)
  reading.form?.requestSubmit()
  expect(answered).toHaveBeenCalledOnce()
})
