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
import { BILLBOARD } from './billboard.copy'
import { CLOSED as TOLD, MODEL } from './billboard.fixture'
import { SessionList, SessionScreen } from './sessions'
import { SESSION_EDIT } from './session-edit.copy'
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
  version: 1,
  additions: [],
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
        sessions={[
          CLOSED,
          { ...OPEN, version: 2, additions: ['chegou a Rosa'] },
          { ...CLOSED, id: 'x', chosen: null },
        ]}
      />,
    )
    expect(
      screen.getByRole('link', { name: 'Nova Sessão' }).getAttribute('href'),
    ).toBe('/sessoes/nova')
    // The open Session first, then the told ones (#272).
    const [open, closed, nothing] = screen.getAllByRole('listitem')
    expect(
      within(closed!).getByRole('link', { name: /Quim/ }).getAttribute('href'),
    ).toBe('/sessoes/2026-11-19-quim')
    expect(closed!.textContent).toContain('Viram Pequenos Milagres')
    expect(closed!.textContent).toContain('Qui, 19 nov')
    expect(closed!.textContent).toContain(SESSIONS.list.told)
    expect(
      within(closed!).queryByRole('link', { name: 'Contar como foi' }),
    ).toBeNull()
    expect(
      within(open!)
        .getByRole('link', { name: /Bruno, Iara/ })
        .getAttribute('href'),
    ).toBe('/sessoes/2026-11-20-iara')
    expect(open!.textContent).toContain(SESSIONS.list.toTell)
    expect(open!.textContent).toContain(SESSIONS.list.version(2))
    // The words, then what she added; not the Climas again (#272).
    expect(open!.textContent).toContain('eu e a Iara + chegou a Rosa')
    expect(open!.textContent).not.toContain('até 2h')
    // The shelf by title, so the night is easy to place (#272).
    expect(open!.textContent).toContain('O Farol de Areia · Pequenos Milagres')
    expect(
      within(open!)
        .getByRole('link', { name: 'Contar como foi' })
        .getAttribute('href'),
    ).toBe('/sessoes/2026-11-20-iara/contar')
    expect(nothing!.textContent).toContain('Não viram nada')
  })

  it('says the Climas and Restrições when the Dono typed no words', () => {
    render(<SessionList sessions={[{ ...OPEN, request: null }]} />)
    expect(screen.getByRole('listitem').textContent).toContain('até 2h')
  })

  it('has one orange button on an empty list (#272)', () => {
    render(<SessionList sessions={[]} />)
    expect(screen.queryByRole('link', { name: 'Nova Sessão' })).toBeNull()
    expect(
      screen.getByRole('link', { name: SESSIONS.list.emptyAction }),
    ).toBeTruthy()
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
    expect(
      screen.getByRole('heading', { name: SESSIONS.list.pendingEmpty }),
    ).toBeTruthy()
    expect(screen.getByText(SESSIONS.list.pendingEmptyLead)).toBeTruthy()
  })
})

describe('the Sessions list, its name and when empty', () => {
  it('names the list by its filter, and says when there is no Session at all', () => {
    render(<SessionList sessions={[OPEN]} pendingOnly />)
    expect(screen.getByRole('list', { name: 'Para contar' })).toBeTruthy()
    cleanup()
    render(<SessionList sessions={[]} />)
    expect(
      screen.getByRole('link', { name: 'Todas' }).getAttribute('aria-current'),
    ).toBe('page')
    expect(
      screen.getByRole('heading', { name: SESSIONS.list.empty }),
    ).toBeTruthy()
    // Empty, the list says what a Session is and opens one (#272).
    expect(screen.getByText(SESSIONS.list.emptyLead)).toBeTruthy()
    expect(
      screen
        .getByRole('link', { name: SESSIONS.list.emptyAction })
        .getAttribute('href'),
    ).toBe('/sessoes/nova')
  })

  it('an open Session with no film says so on its row', () => {
    render(<SessionList sessions={[{ ...OPEN, recommendation: [] }]} />)
    expect(screen.getByRole('listitem').textContent).toContain(
      SESSIONS.films(0),
    )
  })

  it('says when the engine cannot run here', () => {
    render(<SessionList sessions={null} />)
    expect(screen.getByRole('alert').textContent).toContain(
      SESSIONS.unavailable,
    )
  })
})

const PAGE: CartazPage = {
  session: OPEN,
  billboard: MODEL,
  warnings: [],
  addition: null,
}

describe('a Session’s page', () => {
  it('shows the Cartaz of a Session just opened, posting to its reply, and the way to its Feedback', () => {
    render(<SessionScreen page={PAGE} notice="aberta" />)
    // A new Session needs no notice: the Cartaz is it (#272).
    expect(screen.queryByRole('status')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Sex, 20 nov',
    )
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(
      screen.getByRole('form', { name: 'Cartaz' }).getAttribute('action'),
    ).toBe('/sessoes/2026-11-20-iara/responder')
    // In the head's ⋯ menu, and after the last film.
    const told = screen.getAllByRole('link', { name: SESSIONS.list.feedback })
    expect(told.map((link) => link.getAttribute('href'))).toEqual([
      '/sessoes/2026-11-20-iara/contar',
      '/sessoes/2026-11-20-iara/contar',
    ])
  })
})

describe('the head’s ⋯ menu and "?" legend (#272)', () => {
  const opened = () => {
    const menu = screen
      .getByLabelText(SESSIONS.session.menu)
      .closest('details')!
    const legend = screen.getByLabelText(BILLBOARD.legend).closest('details')!
    return { menu, legend }
  }

  it('lists its actions as rows with an icon, as the account menu (#346)', async () => {
    const user = userEvent.setup()
    const sessionLink = 'https://cinema.example/participar?sessao=x&chave=y'
    render(<SessionScreen page={{ ...PAGE, sessionLink }} />)
    await user.click(screen.getByLabelText(SESSIONS.session.menu))
    const { menu } = opened()
    const rows = within(menu).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      SESSIONS.list.feedback,
      SESSIONS.editAttendees.title,
      SESSION_EDIT.menu,
      'Link para os Presentes',
      'Copiar link',
    ])
    for (const row of rows) expect(row.querySelector('svg')).not.toBeNull()
  })

  it('close on a tap outside and on Esc, and one opening closes the other', async () => {
    const user = userEvent.setup()
    render(<SessionScreen page={PAGE} />)
    const { menu, legend } = opened()

    await user.click(screen.getByLabelText(SESSIONS.session.menu))
    expect(menu.open).toBe(true)
    await user.click(screen.getByRole('heading', { level: 1 }))
    expect(menu.open).toBe(false)

    await user.click(screen.getByLabelText(BILLBOARD.legend))
    expect(legend.open).toBe(true)
    await user.keyboard('{Escape}')
    expect(legend.open).toBe(false)
    expect(document.activeElement).toBe(screen.getByLabelText(BILLBOARD.legend))

    await user.click(screen.getByLabelText(SESSIONS.session.menu))
    await user.click(screen.getByLabelText(BILLBOARD.legend))
    await waitFor(() => expect(menu.open).toBe(false))
    expect(legend.open).toBe(true)
    // A tap inside keeps it open.
    await user.click(screen.getByText(BILLBOARD.legendLead))
    expect(legend.open).toBe(true)
  })
})

describe('the head’s ⋯ menu, “Editar pedido” (#372)', () => {
  it('offers "Editar pedido" only to a Dono who was there (#372)', async () => {
    const user = userEvent.setup()
    const session = {
      ...PAGE.session,
      attendees: PAGE.session.attendees.map((a) => ({ ...a, owner: false })),
    }
    render(<SessionScreen page={{ ...PAGE, session }} />)
    await user.click(screen.getByLabelText(SESSIONS.session.menu))
    expect(screen.queryByRole('link', { name: SESSION_EDIT.menu })).toBeNull()
  })
})

/** The Session's page under a router at `path`; gives the router. */
function renderSessionAt(path: string, loader?: () => Promise<void> | void) {
  const router = createRouter({
    routeTree: createRootRoute({
      ...(loader ? { loader } : {}),
      component: () => <SessionScreen page={PAGE} />,
    }),
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  render(<RouterProvider router={router} />)
  return router
}

/** The acrescentar's box. */
const additionBox = () =>
  screen.getByRole<HTMLTextAreaElement>('textbox', { name: /Acrescentar/ })

describe('a Session’s page, a refused reply', () => {
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
      const router = renderSessionAt(path)
      const user = userEvent.setup()
      await screen.findByRole('textbox', { name: /Acrescentar/ })
      await user.type(additionBox(), 'na próxima vez')
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
      expect(additionBox().value).toBe('na próxima vez')

      await user.click(screen.getByRole('button', { name: 'Enviar' }))
      await waitFor(() => {
        expect(router.state.location.href).toBe(`${path}?feito=anotada`)
        expect(additionBox().value).toBe('')
        expect(screen.queryByRole('alert')).toBeNull()
      })
    } finally {
      if (scroll)
        Object.defineProperty(Element.prototype, 'scrollIntoView', scroll)
      else Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
    }
  })
})

describe('a Session’s page, the marks and the Link da Sessão', () => {
  it('keeps the Cartaz marks until the new Cartaz is in', async () => {
    const path = '/sessoes/2026-11-20-iara'
    vi.stubGlobal('scrollTo', vi.fn())
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(() =>
        Promise.resolve(Response.json({ to: `${path}?feito=regerada` })),
      ),
    )
    const reload = Promise.withResolvers<void>()
    let first = true
    const loads = vi.fn<() => Promise<void> | void>(() => {
      if (first) first = false
      else return reload.promise
    })
    renderSessionAt(path, loads)
    const user = userEvent.setup()
    await screen.findByRole('textbox', { name: /Acrescentar/ })
    await user.type(additionBox(), 'na próxima vez')
    expect(localStorage.length).toBe(1)

    await user.click(screen.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(loads).toHaveBeenCalledTimes(2))
    expect(additionBox().value).toBe('na próxima vez')
    expect(localStorage.length).toBe(1)
    reload.resolve()
    await waitFor(() => expect(additionBox().value).toBe(''))
    expect(localStorage.length).toBe(0)
  })

  it('copies the shareable Link da Sessão', async () => {
    const user = userEvent.setup()
    const sessionLink = 'https://cinema.example/participar?sessao=x&chave=y'
    render(<SessionScreen page={{ ...PAGE, sessionLink }} />)

    await user.click(screen.getByRole('button', { name: 'Copiar link' }))
    expect(await navigator.clipboard.readText()).toBe(sessionLink)
    expect(screen.getByRole('status').textContent).toBe('Link copiado')
  })

  it('offers the Dono her own swipe, by the login, only when she may vote (#376)', () => {
    const voteLink = '/participar/votar?sessao=x&chave=y&presente=bruno'
    render(<SessionScreen page={{ ...PAGE, voteLink }} />)
    expect(
      screen.getByRole('link', { name: SESSIONS.session.vote }),
    ).toHaveProperty('href', `http://localhost:3000${voteLink}`)
    cleanup()
    render(<SessionScreen page={{ ...PAGE, voteLink: null }} />)
    expect(
      screen.queryByRole('link', { name: SESSIONS.session.vote }),
    ).toBeNull()
  })
})

describe('a Session’s page, the Link da Sessão by hand and what the reply left', () => {
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
    // The redo is said by the Cartaz's own line ("Refeito: ..."), #272.
    expect(screen.getByText(/^Refeito:/)).toBeTruthy()
    const [warnings, addition] = screen.getAllByRole('status')
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
})

describe('a Session’s page, the acrescentar', () => {
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
    const [addition] = screen.getAllByRole('status')
    // The reading as a sentence (#272).
    expect(addition!.textContent).toBe(
      'Iara entrou na Sessão. Acrescentei ao pedido até 1h50. ' +
        'Deixei “Zeca” só como anotação. ' +
        '“Reprise” pode ser Reprise (2011) ou Reprise (2004). Diga qual na próxima vez. ' +
        '“Amélie” não está no Catálogo. ' +
        'Para guardar um gosto, vá à página da Pessoa.',
    )
    expect(within(addition!).getByRole('link').getAttribute('href')).toBe(
      '/pessoas',
    )
  })
})

describe('a Session’s page, an acrescentar all understood', () => {
  it('says who came in, with no word about keeping a gosto (#272)', () => {
    render(
      <SessionScreen
        page={{
          ...PAGE,
          addition: 'chegou a Rosa e a Iara',
          reading: {
            understood: ['Presente: Rosa', 'Presente: Iara'],
            notUnderstood: [],
            ambiguities: [],
          },
        }}
        notice="regerada"
      />,
    )
    const [addition] = screen.getAllByRole('status')
    expect(addition!.textContent).toBe('Rosa e Iara entraram na Sessão.')
    expect(within(addition!).queryByRole('link')).toBeNull()
  })
})

describe('a Session’s page, an acrescentar only noted and a told Session', () => {
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

  it('opens a told Session with the tape given back, and folds the shelf', () => {
    render(
      <SessionScreen
        page={{
          ...PAGE,
          session: CLOSED,
          billboard: { ...MODEL, open: false },
        }}
      />,
    )
    const tape = screen.getByRole('region', { name: SESSIONS.session.returned })
    expect(tape.textContent).toContain('Pequenos Milagres')
    // A record: no Satisfação of now, which later Sessions change (#272).
    expect(tape.textContent).not.toContain('satisfação')
    expect(
      within(tape)
        .getByRole('link', { name: SESSIONS.session.again })
        .getAttribute('href'),
    ).toBe('/sessoes/nova?presentes=quim')
    expect(
      screen.queryByRole('link', { name: SESSIONS.list.feedback }),
    ).toBeNull()
    // Bruno was not there: no correction for him (#344).
    expect(
      within(tape).queryByRole('link', { name: SESSIONS.session.correct }),
    ).toBeNull()
  })

  it('a Dono who was there may correct what was told (#344)', () => {
    render(
      <SessionScreen
        page={{
          ...PAGE,
          session: {
            ...CLOSED,
            attendees: [{ person: 'bruno', name: 'Bruno', owner: true }],
          },
          billboard: { ...MODEL, open: false },
        }}
      />,
    )
    const tape = screen.getByRole('region', { name: SESSIONS.session.returned })
    expect(
      within(tape)
        .getByRole('link', { name: SESSIONS.session.correct })
        .getAttribute('href'),
    ).toBe(`/sessoes/${CLOSED.id}/contar?corrigir=sim`)
  })
})

describe('a Session’s page, a told Session', () => {
  it('opens with the shelf label and the Dono’s note above the tape, not in the fold (#346)', () => {
    render(
      <SessionScreen
        page={{
          ...PAGE,
          session: {
            ...CLOSED,
            chosen: { id: 'tt9000104', title: 'As Horas Lentas' },
          },
          billboard: TOLD,
        }}
      />,
    )
    const label = screen.getByRole('img', { name: /^Vocês dois/ })
    const note = screen.getByText(TOLD.request.speech!)
    const tape = screen.getByRole('region', { name: SESSIONS.session.returned })
    for (const top of [label, note]) {
      expect(top.closest('details')).toBeNull()
      expect(
        top.compareDocumentPosition(tape) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    }
    expect(screen.getAllByRole('img', { name: /^Vocês dois/ })).toHaveLength(1)
  })

  it('a told Session with its Reações: each one on the tape, the rest of the shelf folded', () => {
    render(
      <SessionScreen
        page={{
          ...PAGE,
          session: {
            ...CLOSED,
            chosen: { id: 'tt9000104', title: 'As Horas Lentas' },
          },
          billboard: TOLD,
        }}
      />,
    )
    const tape = screen.getByRole('region', { name: SESSIONS.session.returned })
    expect(within(tape).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText(SESSIONS.session.others(1))).toBeTruthy()
    expect(screen.getAllByRole('article')).toHaveLength(1)
  })

  it('the tape gives each comment and what the Cartaz kept of the film (#272)', () => {
    const [seen, ...rest] = TOLD.films
    render(
      <SessionScreen
        page={{
          ...PAGE,
          session: {
            ...CLOSED,
            chosen: { id: 'tt9000104', title: 'As Horas Lentas' },
          },
          billboard: {
            ...TOLD,
            films: [
              {
                ...seen!,
                reactions: seen!.reactions!.map((r) =>
                  r.person === 'iara' ? { ...r, comment: 'dormiu no meio' } : r,
                ),
                notes: { stars: 4, comments: ['a Iara riu do trailer'] },
              },
              ...rest,
            ],
          },
        }}
      />,
    )
    const tape = screen.getByRole('region', { name: SESSIONS.session.returned })
    expect(tape.textContent).toContain('“dormiu no meio”')
    expect(tape.textContent).toContain(SESSIONS.session.stars(4))
    expect(tape.textContent).toContain('“a Iara riu do trailer”')
  })

  it('a told Session where nothing was seen says so, over the whole shelf', () => {
    render(
      <SessionScreen
        page={{
          ...PAGE,
          session: { ...CLOSED, chosen: null },
          billboard: { ...MODEL, open: false },
        }}
      />,
    )
    expect(screen.getByText(SESSIONS.session.returnedNothing)).toBeTruthy()
    expect(screen.getByText(SESSIONS.session.shelf)).toBeTruthy()
    expect(screen.getAllByRole('article')).toHaveLength(2)
  })
})

describe('a Session’s page, the reading and refusals', () => {
  it('asks in the bar about the words the reading did not take, until the Dono goes to fix them', async () => {
    const user = userEvent.setup()
    const scrolled = vi.fn<() => void>()
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrolled,
    })
    try {
      render(<SessionScreen page={PAGE} refusal="leitura" words={['xpto']} />)
      // The bar asks; no refusal is alerted above.
      expect(screen.getByRole('alert').textContent).toContain(
        BILLBOARD.reply.unread(['xpto']),
      )
      await user.click(
        screen.getByRole('button', { name: BILLBOARD.reply.edit }),
      )
      expect(screen.queryByRole('alert')).toBeNull()
      expect(scrolled).toHaveBeenCalled()
    } finally {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
    }
  })

  it('a reading refusal with no words left is an alert', () => {
    render(<SessionScreen page={PAGE} refusal="leitura" />)
    expect(screen.getByRole('alert').textContent).toBe(
      SESSIONS.session.refusals.leitura,
    )
  })

  it('says when the Cartaz could not be made, when there is no such Session, or the engine cannot run', () => {
    render(<SessionScreen page={{ ...PAGE, billboard: null }} />)
    expect(screen.getByRole('alert').textContent).toContain(
      SESSIONS.unavailable,
    )
    cleanup()
    render(<SessionScreen page="unknown" />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      SESSIONS.session.unknown,
    )
    expect(
      screen
        .getByRole('link', { name: SESSIONS.session.toList })
        .getAttribute('href'),
    ).toBe('/sessoes')
    cleanup()
    render(<SessionScreen page={null} />)
    expect(screen.getByRole('alert').textContent).toContain(
      SESSIONS.unavailable,
    )
  })
})
