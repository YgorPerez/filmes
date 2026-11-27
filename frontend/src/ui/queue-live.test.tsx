// @vitest-environment jsdom
// The resolution queue with the JavaScript in (#240): each form posts by
// `fetch`, the page goes where the route answers through the router, and
// what it says scrolls into view. The server's side is faked at its edge,
// `fetch`, answering `{ to }` as `answerFetch` does.
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
  useLoaderData,
  useSearch,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { queueSearch } from '#/content/queue-search'
import type { QueuePage } from '#/platform/imports'
import { QUEUE } from './queue.copy'
import { QueueScreen } from './queue'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const QUEUE_PAGE: QueuePage = {
  items: [
    {
      id: 'filme-perdido-2001-91d7fc73cdee',
      name: 'Filme Perdido',
      year: 2001,
      reason: 'nem o Wikidata nem o TMDB acharam o filme',
      people: ['quim'],
      candidates: [
        {
          tmdb: '9102',
          title: 'Filme Perdido',
          originalTitle: null,
          year: 2001,
          link: 'https://www.themoviedb.org/movie/9102',
          poster: null,
          overview: null,
        },
      ],
    },
  ],
  names: { quim: 'Quim' },
  attributions: [],
}

/** The screen under a router, reading `feito` and `erro` as its route. */
function renderRouted() {
  const router = createRouter({
    routeTree: createRootRoute({
      component: function Queue() {
        const { feito, erro } = queueSearch(useSearch({ strict: false }))
        return (
          <QueueScreen
            queue={QUEUE_PAGE}
            done={feito && { notice: feito }}
            refusal={erro}
          />
        )
      },
    }),
    history: createMemoryHistory({ initialEntries: ['/meu-gosto/fila'] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

const card = async () =>
  within(await screen.findByRole('region', { name: 'Filme Perdido (2001)' }))

it('confirms by fetch, and says so where the Dono is', async () => {
  const answered = vi.fn<typeof fetch>(() =>
    Promise.resolve(Response.json({ to: '/meu-gosto/fila?feito=confirmado' })),
  )
  vi.stubGlobal('fetch', answered)
  const scrolled = vi.fn<() => void>()
  Element.prototype.scrollIntoView = scrolled
  const router = renderRouted()

  await userEvent.setup().click(
    (await card()).getByRole('button', {
      name: QUEUE.pickLabel('Filme Perdido (2001)', null),
    }),
  )

  expect((await screen.findByRole('status')).textContent).toBe(
    QUEUE.notices.confirmado(),
  )
  expect(router.state.location.href).toBe('/meu-gosto/fila?feito=confirmado')
  expect(scrolled).toHaveBeenCalled()
  const [, init] = answered.mock.calls[0] ?? []
  expect(new Headers(init?.headers).get('x-filmes-fetch')).toBe('1')
  expect((init?.body as FormData | undefined)?.get('acao')).toBe('confirmar')
})

it('keeps what the Dono typed when the post is refused', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ to: '/meu-gosto/fila?erro=filme' })),
    ),
  )
  Element.prototype.scrollIntoView = () => {}
  renderRouted()
  const user = userEvent.setup()
  await user.click((await card()).getByText(QUEUE.link))
  const confirm = within(
    (await card()).getByRole('form', {
      name: 'Confirmar Filme Perdido (2001)',
    }),
  )

  await user.type(
    confirm.getByLabelText(QUEUE.film, { exact: false }),
    'um filme',
  )
  await user.click(confirm.getByRole('button', { name: QUEUE.confirm }))

  expect((await screen.findByRole('alert')).textContent).toContain(
    QUEUE.refusals.filme,
  )
  expect(
    (confirm.getByLabelText(QUEUE.film, { exact: false }) as HTMLInputElement)
      .value,
  ).toBe('um filme')
})

it('says it is asking TMDB while that runs, and takes no second post', async () => {
  const answered = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}))
  vi.stubGlobal('fetch', answered)
  renderRouted()
  const reprocess = within(
    await screen.findByRole('form', { name: QUEUE.reprocess }),
  )

  await userEvent.setup().click(reprocess.getByRole('button'))

  const asking = reprocess.getByRole('button') as HTMLButtonElement
  expect(asking.textContent).toBe(QUEUE.busy.reprocess)
  expect(asking.disabled).toBe(true)
  asking.form?.requestSubmit()
  expect(answered).toHaveBeenCalledOnce()
})

it('loads the queue again, so the film decided leaves it', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json({ to: '/meu-gosto/fila?feito=confirmado' }),
      ),
    ),
  )
  Element.prototype.scrollIntoView = () => {}
  // The engine's queue, at its edge: the film leaves once decided.
  const queues = [QUEUE_PAGE, { ...QUEUE_PAGE, items: [] }]
  const router = createRouter({
    routeTree: createRootRoute({
      loader: () => queues.shift() ?? null,
      component: function Queue() {
        return <QueueScreen queue={useLoaderData({ strict: false }) ?? null} />
      },
    }),
    history: createMemoryHistory({ initialEntries: ['/meu-gosto/fila'] }),
  })
  render(<RouterProvider router={router} />)

  await userEvent.setup().click(
    (await card()).getByRole('button', {
      name: QUEUE.pickLabel('Filme Perdido (2001)', null),
    }),
  )

  expect(await screen.findByText(QUEUE.empty)).toBeTruthy()
})
