// @vitest-environment jsdom
// The Sessions list and a Session's page: what each shows, and where its
// links go.
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
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import type { CartazPage } from '#/platform/billboard'
import type { SessionItem } from '#/platform/sessions'
import { MODEL } from './billboard.fixture'
import { SessionList, SessionScreen } from './sessions'
import { SESSIONS } from './sessions.copy'

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.unstubAllGlobals()
})

const OPEN: SessionItem = {
  id: '2026-11-20-iara',
  date: '2026-11-20',
  request: 'eu e a Iara',
  attendees: [
    { person: 'bruno', name: 'Bruno', owner: true },
    { person: 'iara', name: 'Iara', owner: false },
  ],
  recommendation: [
    { position: 1, id: 'tt9000101', title: 'O Farol de Areia' },
    { position: 2, id: 'tt9000601', title: 'Pequenos Milagres' },
  ],
  open: true,
  chosen: null,
  moods: ['leve'],
  constraints: ['até 2h', 'com criança de 7 anos'],
}

const CLOSED: SessionItem = {
  ...OPEN,
  id: '2026-11-19-quim',
  date: '2026-11-19',
  request: null,
  attendees: [{ person: 'quim', name: 'Quim', owner: false }],
  open: false,
  chosen: { id: 'tt9000601', title: 'Pequenos Milagres' },
  moods: [],
  constraints: [],
}

describe('the Sessions list', () => {
  it('shows dates, outcomes and a way to tell how an open Session went', () => {
    render(
      <SessionList
        sessions={[CLOSED, OPEN, { ...CLOSED, id: 'x', chosen: null }]}
      />,
    )
    expect(
      screen.getByRole('link', { name: 'Nova Sessão' }).getAttribute('href'),
    ).toBe('/sessoes/nova')
    const [closed, open, nothing] = screen.getAllByRole('listitem')
    expect(
      within(closed!).getByRole('link', { name: /Quim/ }).getAttribute('href'),
    ).toBe('/sessoes/2026-11-19-quim')
    expect(closed!.textContent).toContain('Viram Pequenos Milagres')
    expect(closed!.textContent).toContain('19 de novembro de 2026')
    expect(
      within(closed!).queryByRole('link', { name: 'Contar como foi' }),
    ).toBeNull()
    expect(
      within(open!)
        .getByRole('link', { name: /Bruno, Iara/ })
        .getAttribute('href'),
    ).toBe('/sessoes/2026-11-20-iara')
    expect(open!.textContent).toContain('eu e a Iara')
    expect(open!.textContent).toContain('até 2h')
    expect(
      within(open!)
        .getByRole('link', { name: 'Contar como foi' })
        .getAttribute('href'),
    ).toBe('/sessoes/2026-11-20-iara/contar')
    expect(nothing!.textContent).toContain('Não viram nada')
  })

  it('explains an empty list and highlights its current filter', () => {
    render(<SessionList sessions={[]} pendingOnly />)
    expect(
      screen
        .getByRole('link', { name: 'Para contar' })
        .getAttribute('aria-current'),
    ).toBe('page')
    expect(
      screen.getByRole('link', { name: 'Todas' }).getAttribute('href'),
    ).toBe('/sessoes')
    expect(screen.getByText('Nenhuma Sessão para contar.')).toBeTruthy()
  })

  it('names the list by its filter, and says when there is no Session at all', () => {
    render(<SessionList sessions={[OPEN]} pendingOnly />)
    expect(screen.getByRole('list', { name: 'Para contar' })).toBeTruthy()
    cleanup()
    render(<SessionList sessions={[]} />)
    expect(
      screen.getByRole('link', { name: 'Todas' }).getAttribute('aria-current'),
    ).toBe('page')
    expect(screen.getByText(SESSIONS.list.empty)).toBeTruthy()
  })

  it('says when the engine cannot run here', () => {
    render(<SessionList sessions={null} />)
    expect(screen.getByRole('alert').textContent).toContain(
      SESSIONS.unavailable,
    )
  })
})

describe('a Session’s page', () => {
  const PAGE: CartazPage = {
    session: OPEN,
    billboard: MODEL,
    warnings: [],
    addition: null,
  }

  it('shows the Cartaz of a Session just opened, posting to its reply, and the way to its Feedback', () => {
    render(<SessionScreen page={PAGE} notice="aberta" />)
    expect(screen.getByRole('status').textContent).toBe(
      SESSIONS.session.notices.aberta,
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Sessão de 20 de novembro de 2026',
    )
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(
      screen.getByRole('form', { name: 'Cartaz' }).getAttribute('action'),
    ).toBe('/sessoes/2026-11-20-iara/responder')
    expect(
      screen
        .getByRole('link', { name: SESSIONS.list.feedback })
        .getAttribute('href'),
    ).toBe('/sessoes/2026-11-20-iara/contar')
  })

  it('keeps a refused Cartaz reply ready to retry and clears it when saved', async () => {
    const path = '/sessoes/2026-11-20-iara'
    const pending = Promise.withResolvers<Response>()
    vi.stubGlobal('scrollTo', vi.fn())
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValueOnce(Response.json({ to: `${path}?feito=anotada` })),
    )
    const scroll = Object.getOwnPropertyDescriptor(
      Element.prototype,
      'scrollIntoView',
    )
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: () => {},
    })
    try {
      const router = createRouter({
        routeTree: createRootRoute({
          component: () => <SessionScreen page={PAGE} />,
        }),
        history: createMemoryHistory({ initialEntries: [path] }),
      })
      render(<RouterProvider router={router} />)
      const user = userEvent.setup()
      const addition = () =>
        screen.getByRole<HTMLTextAreaElement>('textbox', {
          name: /Acrescentar/,
        })
      await screen.findByRole('textbox', { name: /Acrescentar/ })
      await user.type(addition(), 'na próxima vez')
      await user.click(screen.getByRole('button', { name: 'Enviar' }))
      expect(
        screen
          .getByRole<HTMLButtonElement>('button', { name: 'Enviando…' })
          .matches(':disabled'),
      ).toBe(true)

      pending.resolve(Response.json({ to: `${path}?erro=indisponivel` }))
      expect((await screen.findByRole('alert')).textContent).toContain(
        SESSIONS.session.refusals.indisponivel,
      )
      expect(router.state.location.href).toBe(path)
      expect(addition().value).toBe('na próxima vez')

      await user.click(screen.getByRole('button', { name: 'Enviar' }))
      await waitFor(() => {
        expect(router.state.location.href).toBe(`${path}?feito=anotada`)
        expect(addition().value).toBe('')
        expect(screen.queryByRole('alert')).toBeNull()
      })
    } finally {
      if (scroll)
        Object.defineProperty(Element.prototype, 'scrollIntoView', scroll)
      else Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
    }
  })

  it('copies the shareable Link da Sessão', async () => {
    const user = userEvent.setup()
    const sessionLink = 'https://cinema.example/participar?sessao=x&chave=y'
    render(<SessionScreen page={{ ...PAGE, sessionLink }} />)

    await user.click(screen.getByRole('button', { name: 'Copiar link' }))
    expect(await navigator.clipboard.readText()).toBe(sessionLink)
    expect(screen.getByRole('status').textContent).toBe('Link copiado')
  })

  it('shows the Link da Sessão to select when the clipboard refuses it', async () => {
    const user = userEvent.setup()
    const sessionLink = 'https://cinema.example/participar?sessao=x&chave=y'
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(
      new Error('denied'),
    )
    render(<SessionScreen page={{ ...PAGE, sessionLink }} />)

    await user.click(screen.getByRole('button', { name: 'Copiar link' }))
    expect(screen.getByRole('status').textContent).toBe(
      'Selecione o link abaixo para copiar.',
    )
    const field = screen.getByRole('textbox', {
      name: 'Link para os Presentes',
    })
    expect((field as HTMLInputElement).value).toBe(sessionLink)
    await user.click(field)
    const input = field as HTMLInputElement
    expect([input.selectionStart, input.selectionEnd]).toEqual([
      0,
      sessionLink.length,
    ])
  })

  it('shows what the reply or the form left: the warnings, the acrescentar, a refusal', () => {
    render(
      <SessionScreen
        page={{
          ...PAGE,
          warnings: ['só 2 passaram nas Restrições'],
          addition: 'chegou a Ana',
        }}
        notice="regerada"
        refusal="regerar"
      />,
    )
    const [regenerated, warnings, addition] = screen.getAllByRole('status')
    expect(regenerated!.textContent).toBe(SESSIONS.session.notices.regerada)
    expect(warnings!.textContent).toBe(
      `${SESSIONS.session.warnings}só 2 passaram nas Restrições`,
    )
    expect(addition!.textContent).toContain('chegou a Ana')
    expect(within(addition!).getByRole('link').getAttribute('href')).toBe(
      '/pessoas',
    )
    expect(screen.getByRole('alert').textContent).toContain(
      SESSIONS.session.refusals.regerar,
    )
  })

  it('says what the acrescentar put in the request and what it did not understand', () => {
    render(
      <SessionScreen
        page={{
          ...PAGE,
          addition: 'chegou a Iara e o Zeca, parecido com Reprise e Amélie',
          reading: {
            understood: ['Presente: Iara', 'até 1h50'],
            notUnderstood: ['Zeca'],
            ambiguities: [
              {
                field: 'similar',
                words: 'Reprise',
                candidates: [
                  { id: 'tt9012601', label: 'Reprise (2011)' },
                  { id: 'tt9012602', label: 'Reprise (2004)' },
                ],
              },
              { field: 'similar', words: 'Amélie', candidates: [] },
            ],
          },
        }}
        notice="regerada"
      />,
    )
    const [, addition] = screen.getAllByRole('status')
    expect(addition!.textContent).toBe(
      'Você acrescentou “chegou a Iara e o Zeca, parecido com Reprise e Amélie”. ' +
        'Acrescentei ao pedido Presente: Iara, até 1h50. ' +
        'Deixei “Zeca” só como anotação. ' +
        '“Reprise” pode ser Reprise (2011) ou Reprise (2004). Diga qual na próxima vez. ' +
        '“Amélie” não está no Catálogo. ' +
        'Para guardar um gosto, vá à página da Pessoa.',
    )
    expect(within(addition!).getByRole('link').getAttribute('href')).toBe(
      '/pessoas',
    )
  })

  it('says an acrescentar with nothing understood was only noted', () => {
    render(
      <SessionScreen
        page={{
          ...PAGE,
          addition: 'a Iara odeia terror',
          reading: {
            understood: [],
            notUnderstood: ['Iara odeia terror'],
            ambiguities: [],
          },
        }}
        notice="anotada"
      />,
    )
    const [, addition] = screen.getAllByRole('status')
    expect(addition!.textContent).toBe(
      'Você acrescentou “a Iara odeia terror”. ' +
        'Deixei “Iara odeia terror” só como anotação. ' +
        'Para guardar um gosto, vá à página da Pessoa.',
    )
  })

  it('says a closed Session is closed, and what they saw', () => {
    render(
      <SessionScreen
        page={{
          ...PAGE,
          session: CLOSED,
          billboard: { ...MODEL, open: false },
        }}
      />,
    )
    expect(screen.getByText('Fechada.')).toBeTruthy()
    expect(screen.getByText('Viram Pequenos Milagres.')).toBeTruthy()
    expect(
      screen.queryByRole('link', { name: SESSIONS.list.feedback }),
    ).toBeNull()
  })

  it('says when the Cartaz could not be made, when there is no such Session, or the engine cannot run', () => {
    render(<SessionScreen page={{ ...PAGE, billboard: null }} />)
    expect(screen.getByRole('alert').textContent).toContain(
      SESSIONS.unavailable,
    )
    cleanup()
    render(<SessionScreen page="unknown" />)
    expect(screen.getByRole('alert').textContent).toContain(
      SESSIONS.session.unknown,
    )
    cleanup()
    render(<SessionScreen page={null} />)
    expect(screen.getByRole('alert').textContent).toContain(
      SESSIONS.unavailable,
    )
  })
})
