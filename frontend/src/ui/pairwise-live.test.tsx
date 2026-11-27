// @vitest-environment jsdom
// The Perguntas par a par with the JavaScript in (#240): an answer posts by
// `fetch` and the next pair comes through the router, without a reload.
// The server's side is faked at its edge, `fetch`, answering `{ to }` as
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
import { PairwiseQuestion } from './pairwise'
import { PAIRWISE } from './pairwise.copy'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const LINK = { session: '2026-11-20-teo', token: 'k'.repeat(43), person: 'teo' }
const FAROL = {
  id: 'tt9000101',
  title: 'O Farol de Areia',
  year: 2012,
  poster: null,
}
const PONTE = {
  id: 'tt9000201',
  title: 'Ponte Aérea',
  year: 2016,
  poster: null,
}
const NEXT = `/participar/perguntas?sessao=${LINK.session}&chave=${LINK.token}&presente=teo`

function renderRouted() {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => (
        <PairwiseQuestion
          page={{ answered: 0, total: 10, pair: [PONTE, FAROL] }}
          link={LINK}
          back="/participar"
        />
      ),
    }),
    history: createMemoryHistory({ initialEntries: [NEXT] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

const form = async () =>
  within(await screen.findByRole('form', { name: PAIRWISE.title }))

it('answers by fetch and goes to the next pair through the router', async () => {
  const answered = vi.fn<typeof fetch>(() =>
    Promise.resolve(Response.json({ to: `${NEXT}&erro=1` })),
  )
  vi.stubGlobal('fetch', answered)
  const router = renderRouted()

  await userEvent
    .setup()
    .click((await form()).getByRole('button', { name: 'Ponte Aérea (2016)' }))

  await waitFor(() => expect(router.state.location.href).toBe(`${NEXT}&erro=1`))
  const [, init] = answered.mock.calls[0] ?? []
  expect(new Headers(init?.headers).get('x-filmes-fetch')).toBe('1')
  expect((init?.body as FormData | undefined)?.get('escolha')).toBe(PONTE.id)
})

it('takes no second answer while one runs', async () => {
  const answered = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}))
  vi.stubGlobal('fetch', answered)
  renderRouted()
  const question = await form()

  await userEvent
    .setup()
    .click(question.getByRole('button', { name: 'Ponte Aérea (2016)' }))

  const choices = question.getAllByRole('button') as HTMLButtonElement[]
  expect(choices.map((b) => b.disabled)).toEqual([true, true, true])
  expect(answered).toHaveBeenCalledOnce()
})
