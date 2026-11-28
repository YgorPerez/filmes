// @vitest-environment jsdom
// A form posted by `fetch` (#235): it stays busy until the page it went to
// has its data again, runs what the screen asked for only then, and never
// sends a post twice: an answer it cannot go by is said in place. The
// server's side is faked at `fetch`, the page's data at the route's loader.
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { PostAnswers, PostForm } from './post-form'
import { POST_FAILED } from './status'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** A loader whose second and later runs wait for `finish`, or fail. */
function pageData(next: 'waits' | 'fails' = 'waits') {
  let finish = () => {}
  const loads = vi.fn<() => Promise<void> | void>(() => {
    if (loads.mock.calls.length === 1) return
    if (next === 'fails') return Promise.reject(new Error('down'))
    return new Promise<void>((resolve) => (finish = resolve))
  })
  return { loads, finish: () => finish() }
}

/** A `PostForm` on `/fila` under a router, as the app has it. */
function showForm(
  loads: () => Promise<void> | void,
  onAnswer: ComponentProps<typeof PostAnswers>['onAnswer'] = () => false,
) {
  const router = createRouter({
    routeTree: createRootRoute({
      loader: loads,
      component: () => (
        <PostAnswers onAnswer={onAnswer}>
          <PostForm action="/fila/acao" label="Descartar">
            {(busy) => (
              <button type="submit" disabled={busy}>
                {busy ? 'Descartando…' : 'Descartar'}
              </button>
            )}
          </PostForm>
        </PostAnswers>
      ),
    }),
    history: createMemoryHistory({ initialEntries: ['/fila'] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

const answering = (answer: () => Promise<Response>) => {
  const answered = vi.fn<typeof fetch>(answer)
  vi.stubGlobal('fetch', answered)
  return answered
}

const send = async () =>
  userEvent
    .setup()
    .click(await screen.findByRole('button', { name: 'Descartar' }))

it('stays busy until the page has its data again, loaded once', async () => {
  answering(() => Promise.resolve(Response.json({ to: '/fila?feito=1' })))
  const { loads, finish } = pageData()
  const router = showForm(loads)

  await send()

  await waitFor(() => expect(loads).toHaveBeenCalledTimes(2))
  expect(router.state.location.href).toBe('/fila?feito=1')
  expect(
    (screen.getByRole('button', { name: 'Descartando…' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
  finish()
  expect(
    (
      (await screen.findByRole('button', {
        name: 'Descartar',
      })) as HTMLButtonElement
    ).disabled,
  ).toBe(false)
  expect(loads).toHaveBeenCalledTimes(2)
})

it('runs what the screen asked for once the page loaded, not before', async () => {
  answering(() => Promise.resolve(Response.json({ to: '/fila?feito=1' })))
  const { loads, finish } = pageData()
  const landed = vi.fn<() => void>()
  showForm(loads, () => landed)

  await send()

  await waitFor(() => expect(loads).toHaveBeenCalledTimes(2))
  expect(landed).not.toHaveBeenCalled()
  finish()
  await waitFor(() => expect(landed).toHaveBeenCalledOnce())
})

it('leaves what the screen asked for when the page fails to load', async () => {
  answering(() => Promise.resolve(Response.json({ to: '/fila?feito=1' })))
  const { loads } = pageData('fails')
  const landed = vi.fn<() => void>()
  const router = showForm(loads, () => landed)

  await send()

  await waitFor(() =>
    expect(router.state.matches.some((m) => m.status === 'error')).toBe(true),
  )
  expect(landed).not.toHaveBeenCalled()
})

it.each([
  [
    'answers another thing',
    () => Promise.resolve(new Response('Origem recusada', { status: 403 })),
  ],
  ['cannot be reached', () => Promise.reject(new TypeError('offline'))],
])('says so, and sends nothing again, when the route %s', async (_, answer) => {
  const answered = answering(answer)
  const plain = vi
    .spyOn(HTMLFormElement.prototype, 'submit')
    .mockImplementation(() => {})
  const router = showForm(pageData().loads)

  await send()

  expect((await screen.findByRole('alert')).textContent).toBe(POST_FAILED)
  expect(answered).toHaveBeenCalledOnce()
  expect(plain).not.toHaveBeenCalled()
  expect(router.state.location.href).toBe('/fila')
  // The next post clears it while it runs.
  answered.mockImplementation(() => new Promise<Response>(() => {}))
  await send()
  expect(screen.queryByRole('alert')).toBeNull()
})
