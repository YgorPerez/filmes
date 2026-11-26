// @vitest-environment jsdom
// "Acrescentar Pessoa" with the JavaScript in (#235): the form posts by
// `fetch`, a refusal shows in place over what was typed, and the new
// Pessoa's page opens through the router. The server's side is faked at
// `fetch`, answering `{ to }` as `answerFetch` does.
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { PeopleList } from './people'
import { PEOPLE } from './person.copy'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const BRUNO = { person: 'bruno', name: 'Bruno', aliases: [], owner: true }

function showRouted() {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <PeopleList people={[BRUNO]} self="bruno" />,
    }),
    history: createMemoryHistory({ initialEntries: ['/pessoas'] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

/** Opens the form and types a name in it. */
async function typeName(name: string) {
  const user = userEvent.setup()
  await user.click(await screen.findByText(PEOPLE.create.title))
  const form = screen.getByRole('form', { name: PEOPLE.create.title })
  await user.type(within(form).getByLabelText(PEOPLE.create.name), name)
  return { user, form: form as HTMLFormElement }
}

it('shows the refusal in place, keeping what was typed', async () => {
  const answered = vi.fn<typeof fetch>(() =>
    Promise.resolve(Response.json({ to: '/pessoas?erro=existe&nome=Iara' })),
  )
  vi.stubGlobal('fetch', answered)
  Element.prototype.scrollIntoView = vi.fn<() => void>()
  const router = showRouted()
  const { user, form } = await typeName('Iara')

  await user.click(
    within(form).getByRole('button', { name: PEOPLE.create.submit }),
  )

  expect((await within(form).findByRole('alert')).textContent).toContain(
    PEOPLE.create.refusals.existe,
  )
  expect(
    new Headers(answered.mock.calls[0]?.[1]?.headers).get('x-filmes-fetch'),
  ).toBe('1')
  expect(new FormData(form).get('nome')).toBe('Iara')
  expect(router.state.location.href).toBe('/pessoas')
})

it('says it is adding while the post runs, and opens her page after', async () => {
  const answer = Promise.withResolvers<Response>()
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => answer.promise),
  )
  const router = showRouted()
  const { user, form } = await typeName('Luana Reis')

  await user.click(
    within(form).getByRole('button', { name: PEOPLE.create.submit }),
  )
  const adding = within(form).getByRole('button', {
    name: PEOPLE.create.submitting,
  }) as HTMLButtonElement
  expect(adding.disabled).toBe(true)

  answer.resolve(Response.json({ to: '/pessoas/luana-reis?feito=criada' }))
  await vi.waitFor(() =>
    expect(router.state.location.href).toBe('/pessoas/luana-reis?feito=criada'),
  )
})
