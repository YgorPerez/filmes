// @vitest-environment jsdom
// The rating screen with the JavaScript in (#240): Pronto posts by `fetch`,
// the page goes where the route answers through the router, and the
// draft hears the answer without a reload. The server's side is faked at
// its edge, `fetch`, answering `{ to }` as `answerFetch` does.
import type { RatingQueue } from '@filmes/engine'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
  useSearch,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'
import { isRatingRefusal, writtenCount } from '#/content/rating-form'
import { RatingScreen } from './imports'
import { RATINGS } from './ratings.copy'

const QUEUE: RatingQueue = {
  person: 'teo',
  films: [
    { id: 'tt9000601', title: 'Pequenos Milagres', year: 2019, genres: [] },
    { id: 'tt9000602', title: 'Casa Cheia', year: 2021, genres: [] },
  ],
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** The screen under a router, reading `feito` and `erro` as its route. */
function renderRouted() {
  const router = createRouter({
    routeTree: createRootRoute({
      component: function Ratings() {
        const search: Record<string, unknown> = useSearch({ strict: false })
        return (
          <RatingScreen
            queue={QUEUE}
            search={null}
            written={writtenCount(search.feito)}
            refusal={isRatingRefusal(search.erro) ? search.erro : undefined}
          />
        )
      },
    }),
    history: createMemoryHistory({ initialEntries: ['/meu-gosto/notas'] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

const card = async () => within(await screen.findByRole('article'))

const answering = (to: string) =>
  vi.fn<typeof fetch>(() => Promise.resolve(Response.json({ to })))

it('writes the Notas by fetch, and the draft lets them go', async () => {
  const answered = answering('/meu-gosto/notas?feito=1')
  vi.stubGlobal('fetch', answered)
  // jsdom lays nothing out: the notice scrolls into view in a browser.
  const scrolled = vi.fn<() => void>()
  Element.prototype.scrollIntoView = scrolled
  const router = renderRouted()
  const user = userEvent.setup()

  await user.click((await card()).getByRole('button', { name: 'Nota 8' }))
  await user.click(screen.getByRole('button', { name: RATINGS.done(1) }))

  expect((await screen.findByRole('status')).textContent).toBe(
    RATINGS.written(1),
  )
  expect(router.state.location.href).toBe('/meu-gosto/notas?feito=1')
  expect(screen.getByRole('button', { name: RATINGS.done(0) })).toBeTruthy()
  expect(scrolled).toHaveBeenCalled()
  const [, init] = answered.mock.calls[0] ?? []
  expect(new Headers(init?.headers).get('x-filmes-fetch')).toBe('1')
  expect((init?.body as FormData | undefined)?.get('nota.tt9000601')).toBe('8')
})

it('keeps the Notas when the post is refused', async () => {
  vi.stubGlobal('fetch', answering('/meu-gosto/notas?erro=indisponivel'))
  Element.prototype.scrollIntoView = () => {}
  renderRouted()
  const user = userEvent.setup()

  await user.click((await card()).getByRole('button', { name: 'Nota 8' }))
  await user.click(screen.getByRole('button', { name: RATINGS.done(1) }))

  expect((await screen.findByRole('alert')).textContent).toContain(
    RATINGS.refusals.indisponivel,
  )
  expect(screen.getByRole('button', { name: RATINGS.done(1) })).toBeTruthy()
})

it('says it is writing while Pronto runs, and takes no second post', async () => {
  const answered = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}))
  vi.stubGlobal('fetch', answered)
  renderRouted()
  const user = userEvent.setup()

  await user.click((await card()).getByRole('button', { name: 'Nota 8' }))
  await user.click(screen.getByRole('button', { name: RATINGS.done(1) }))

  const writing = screen.getByRole('button', {
    name: RATINGS.writing,
  }) as HTMLButtonElement
  expect(writing.disabled).toBe(true)
  writing.form?.requestSubmit()
  expect(answered).toHaveBeenCalledOnce()
})
