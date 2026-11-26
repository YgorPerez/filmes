// @vitest-environment jsdom
// A Pessoa's page with the JavaScript in (#235): each form posts by
// `fetch` to the same route, which answers `{ to }` as `answerFetch` does.
// A refusal shows in the form that got it, with what was typed; what went
// through reloads the page's data through the router, and the fold it was
// in closes, empty. The server's side is faked at `fetch`.
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
import type { ComponentProps } from 'react'
import { renderToString } from 'react-dom/server'
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { isPersonNotice } from '#/content/person-action'
import { CATALOG_SEARCH } from './catalog-search.copy'
import { PersonScreen } from './person'
import { PERSON } from './person.copy'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** A Pessoa's page as the engine reads it. */
type PersonPage = Exclude<
  ComponentProps<typeof PersonScreen>['page'],
  'unknown' | null
>

const IARA: PersonPage = {
  person: 'iara',
  name: 'Iara',
  aliases: [],
  owner: false,
  viewer: { person: 'bruno', name: 'Bruno', admin: false },
  vetoes: [
    {
      text: 'nunca vê terror',
      target: 'Q9001801',
      label: 'Terror',
      date: '2026-11-19',
      factId: 'vetos:1',
    },
  ],
  adjustments: [],
  stated: [],
  reports: [],
  seen: [],
  openQuestions: [
    {
      text: 'a Iara curte terror?',
      subject: 'Q9001801',
      label: 'Terror',
      date: '2026-11-14',
      skips: 1,
      factId: 'perguntas_abertas:1',
    },
  ],
  ratings: [],
  tagGroups: [],
}

/** `fetch` answering every post with `to`, as `answerFetch` does. */
const answering = (to: string) => {
  const answered = vi.fn<typeof fetch>(() =>
    Promise.resolve(Response.json({ to })),
  )
  vi.stubGlobal('fetch', answered)
  return answered
}

/** The page under a router at `href`, as the app has it; `loads` counts
 * the times its loader ran. */
function showRouted(href = '/pessoas/iara') {
  const loads = vi.fn<() => void>()
  const router = createRouter({
    routeTree: createRootRoute({
      loader: () => loads(),
      component: function Person() {
        const { feito } = useSearch({ strict: false })
        return (
          <PersonScreen
            slug="iara"
            page={IARA}
            notice={isPersonNotice(feito) ? feito : undefined}
          />
        )
      },
    }),
    history: createMemoryHistory({ initialEntries: [href] }),
  })
  render(<RouterProvider router={router} />)
  return Object.assign(router, { loads })
}

const vetoes = () => screen.getByRole('region', { name: PERSON.vetoes.title })

/** Opens "Acrescentar Veto" and types a Veto in it. */
async function typeVeto(text: string) {
  const user = userEvent.setup()
  await screen.findByRole('region', { name: PERSON.vetoes.title })
  await user.click(within(vetoes()).getByText(PERSON.vetoes.add))
  const form = within(vetoes()).getByRole('form', { name: PERSON.vetoes.add })
  await user.type(
    within(form).getByLabelText(PERSON.vetoes.text, { exact: false }),
    text,
  )
  await user.type(within(form).getByLabelText(/^Alvo/), 'Q1')
  return { user, form: form as HTMLFormElement }
}

it('shows a refusal in the form that got it, keeping what was typed', async () => {
  const answered = answering('/pessoas/iara?erro=alvo')
  Element.prototype.scrollIntoView = vi.fn<() => void>()
  const router = showRouted()
  const { user, form } = await typeVeto('nunca')

  await user.click(within(form).getByRole('button', { name: PERSON.save }))

  expect((await within(form).findByRole('alert')).textContent).toContain(
    PERSON.refusals.alvo,
  )
  const [url, init] = answered.mock.calls[0] ?? []
  expect(url).toBe(form.action)
  expect(new Headers(init?.headers).get('x-filmes-fetch')).toBe('1')
  expect(new FormData(form).get('texto')).toBe('nunca')
  expect(form.closest('details')?.open).toBe(true)
  expect(router.state.location.href).toBe('/pessoas/iara')
})

it('reloads the page through the router when it went through, the fold closed and empty', async () => {
  answering('/pessoas/iara?feito=gravado')
  const router = showRouted()
  const { user, form } = await typeVeto('nunca')

  await user.click(within(form).getByRole('button', { name: PERSON.save }))

  await waitFor(() =>
    expect(router.state.location.href).toBe('/pessoas/iara?feito=gravado'),
  )
  // Her page again: its data reloads, as the router keeps it otherwise.
  await waitFor(() => expect(router.loads).toHaveBeenCalledTimes(2))
  expect(form.closest('details')?.open).toBe(false)
  expect(new FormData(form).get('texto')).toBe('')
  expect(within(form).queryByRole('alert')).toBeNull()
})

it('says it is saving while the post runs, and takes no second one', async () => {
  const answered = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}))
  vi.stubGlobal('fetch', answered)
  showRouted()
  const { user, form } = await typeVeto('nunca')

  await user.click(within(form).getByRole('button', { name: PERSON.save }))

  const saving = within(form).getByRole('button', {
    name: PERSON.saving,
  }) as HTMLButtonElement
  expect(saving.disabled).toBe(true)
  form.requestSubmit()
  expect(answered).toHaveBeenCalledOnce()
})

it('says what “Tirar” and “Pular” are doing while they post', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => new Promise<Response>(() => {})),
  )
  showRouted()
  const user = userEvent.setup()

  await user.click(
    await screen.findByRole('button', {
      name: PERSON.removeLabel('nunca vê terror'),
    }),
  )
  await user.click(
    screen.getByRole('button', {
      name: `${PERSON.questions.skip}: a Iara curte terror?`,
    }),
  )

  // Their names say it too, not what they do when idle.
  expect(
    (
      within(vetoes()).getByRole('button', {
        name: PERSON.removing,
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true)
  expect(
    screen.queryByRole('button', {
      name: PERSON.removeLabel('nunca vê terror'),
    }),
  ).toBeNull()
  expect(
    screen.getByRole('button', { name: PERSON.questions.skipping }),
  ).toBeTruthy()
})

it('hides the notice of the last post while a form shows its refusal', async () => {
  answering('/pessoas/iara?erro=alvo')
  Element.prototype.scrollIntoView = vi.fn<() => void>()
  showRouted('/pessoas/iara?feito=gravado')
  expect((await screen.findByRole('status')).textContent).toBe(
    PERSON.notices.gravado,
  )
  const { user, form } = await typeVeto('nunca')

  await user.click(within(form).getByRole('button', { name: PERSON.save }))

  await within(form).findByRole('alert')
  expect(screen.queryByRole('status')).toBeNull()
})

it('clears a refusal a form showed once a later post goes through', async () => {
  const answered = answering('/pessoas/iara?erro=alvo')
  Element.prototype.scrollIntoView = vi.fn<() => void>()
  const router = showRouted()
  const { user, form } = await typeVeto('nunca')
  await user.click(within(form).getByRole('button', { name: PERSON.save }))
  await within(form).findByRole('alert')

  answered.mockImplementation(() =>
    Promise.resolve(Response.json({ to: '/pessoas/iara?feito=removido' })),
  )
  await user.click(
    screen.getByRole('button', {
      name: `${PERSON.questions.skip}: a Iara curte terror?`,
    }),
  )

  await waitFor(() =>
    expect(router.state.location.href).toBe('/pessoas/iara?feito=removido'),
  )
  expect(within(form).queryByRole('alert')).toBeNull()
})

it('goes to the list when her Pessoa is gone', async () => {
  answering('/pessoas?erro=pessoa')
  const router = showRouted()

  await userEvent.setup().click(
    await screen.findByRole('button', {
      name: PERSON.removeLabel('nunca vê terror'),
    }),
  )

  await waitFor(() =>
    expect(router.state.location.href).toBe('/pessoas?erro=pessoa'),
  )
})

it('searches the Catálogo through the router, keeping the page', async () => {
  const router = showRouted()
  const user = userEvent.setup()
  const search = await screen.findByRole('search', {
    name: CATALOG_SEARCH.title,
  })

  await user.type(within(search).getByRole('searchbox'), 'terror')
  await user.click(
    within(search).getByRole('button', { name: CATALOG_SEARCH.submit }),
  )

  await waitFor(() =>
    expect(router.state.location.href).toBe('/pessoas/iara?buscar=terror'),
  )
})

it('is plain forms that post before the JavaScript', () => {
  const doc = new DOMParser().parseFromString(
    renderToString(<PersonScreen slug="iara" page={IARA} />),
    'text/html',
  )
  const forms = [...doc.querySelectorAll('form[method="post"]')]
  expect(forms.length).toBeGreaterThan(0)
  for (const form of forms)
    expect(form.getAttribute('action')).toBe('/pessoas/iara/acao')
  expect(doc.querySelector('button[disabled]')).toBeNull()
  expect(doc.body.textContent).not.toContain(PERSON.saving)
})
