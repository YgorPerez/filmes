// @vitest-environment jsdom
// The Cartaz's MCP Apps view (#111) with a fake host: what it shows for the
// `billboard` tool's result, Enviar through `answer_billboard` and the
// message the chat receives, the host's theme and fullscreen. The bundled file in
// a real frame-like page is `scripts/billboard-view.test.ts`.
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  afterEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vite-plus/test'
import { CHOSEN_OUTSIDE, CLOSED, MODEL } from '../ui/billboard.fixture'
import { SEND_STATUS } from '../ui/billboard-send.copy'
import { BILLBOARD } from '../ui/billboard.copy'
import { NEW_STICKER } from '../ui/kit/sticker'
import { BillboardView, type Host } from './billboard-view'
import { mountView, type ViewApp } from './mount-view'
import { AGAIN, replyMessage, type ToolResult } from './view-model'

afterEach(() => {
  cleanup()
  localStorage.clear()
  delete document.documentElement.dataset.theme
})

const { view, reply: copy } = BILLBOARD

const json = (value: unknown, isError = false): ToolResult => ({
  isError,
  content: [{ type: 'text', text: JSON.stringify(value) }],
})

const shown = json({ session: MODEL.session, films: 2, billboard: MODEL })

const REPLY = {
  session: { id: MODEL.session, file: 'sessions/x.md' },
  version: 2,
  currentVersion: 2,
  regenerate: true,
  keep: ['tt9000105'],
  dropped: [
    {
      position: 1,
      id: 'tt9000104',
      title: 'As Horas Lentas',
      cause: 'swapped' as const,
    },
  ],
  addition: null,
  moods: null,
  comments: [],
  stars: [],
  seen: [],
  warnings: [],
}

const TAG = '(pelo Cartaz · v2)'
const CONTEXT =
  'Resposta do Cartaz 2026-11-20-iara v2, já gravada por answer_billboard (não chame de novo):\n' +
  'refazer · manter: tt9000105'

const fakeHost = (answer: ToolResult | Error, told: unknown = {}) => ({
  callTool: vi.fn<Host['callTool']>(() =>
    answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer),
  ),
  sendMessage: vi.fn<Host['sendMessage']>(() =>
    told instanceof Error
      ? Promise.reject(told)
      : Promise.resolve(told as { isError?: boolean }),
  ),
})

const card = (n: number) => within(screen.getAllByRole('article')[n - 1]!)
const status = () => screen.getByRole('status').textContent

async function swapFirstAndSend() {
  const user = userEvent.setup()
  await user.click(card(1).getByRole('button', { name: 'Trocar' }))
  await user.click(screen.getByRole('button', { name: copy.send }))
  return user
}

describe('the view shows', () => {
  it('a wait until the host gives the result', () => {
    render(<BillboardView result={null} host={fakeHost(json({}))} />)
    expect(screen.getByText(view.loading)).toBeTruthy()
  })

  it("the Cartaz of the billboard tool's result", () => {
    render(<BillboardView result={shown} host={fakeHost(json({}))} />)
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(screen.getByRole('form', { name: BILLBOARD.label })).toBeTruthy()
  })

  it('the Aposta’s stamp on the bet', () => {
    render(<BillboardView result={shown} host={fakeHost(json({}))} />)
    expect(card(2).getByText(BILLBOARD.card.bet)).toBeTruthy()
    expect(card(1).queryByText(BILLBOARD.card.bet)).toBeNull()
  })

  it('the NOVO sticker on the film that came in with this version (#380)', () => {
    render(<BillboardView result={shown} host={fakeHost(json({}))} />)
    expect(card(2).getByText(NEW_STICKER)).toBeTruthy()
    expect(card(1).queryByText(NEW_STICKER)).toBeNull()
  })

  it('the Nota prevista the tool result carries', () => {
    render(<BillboardView result={shown} host={fakeHost(json({}))} />)
    const name = card(1).getByRole('button', {
      name: 'Você: pela nota de 12 pessoas de gosto parecido',
    })
    expect(name.closest('p')?.textContent).toMatch(/^previsto · Você.* 8,3$/u)
  })

  it("plain words for the engine's error, never its message", () => {
    const failed = json(
      {
        error: {
          code: 'unknown_session',
          message: "não há Sessão 'x' em /srv/dados/sessions",
        },
      },
      true,
    )
    render(<BillboardView result={failed} host={fakeHost(json({}))} />)
    expect(screen.getByRole('alert').textContent).toBe(
      view.error('unknown_session'),
    )
    expect(screen.queryByText(/srv/)).toBeNull()
  })

  it('a result that is not JSON is an error too', () => {
    const odd = { isError: true, content: [{ type: 'text', text: 'falhou' }] }
    render(<BillboardView result={odd} host={fakeHost(json({}))} />)
    expect(screen.getByRole('alert').textContent).toBe(view.error(null))
  })
})

describe('the view shows, with no text or as the page', () => {
  it('a result with no text at all is an error too', () => {
    render(
      <BillboardView result={{ isError: true }} host={fakeHost(json({}))} />,
    )
    expect(screen.getByRole('alert').textContent).toBe(view.error(null))
  })

  it('the Cartaz is the page’s one h1', () => {
    render(<BillboardView result={shown} host={fakeHost(json({}))} />)
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Cartaz: Vocês dois',
    )
  })
})

describe('the view shows, a closed Session', () => {
  const closed = (billboard: typeof CLOSED, host: Partial<Host> = {}) =>
    render(
      <BillboardView
        result={json({ session: billboard.session, billboard })}
        host={{ ...fakeHost(json({})), ...host }}
      />,
    )
  const reactions = () =>
    screen.getAllByRole('list', { name: 'Filme escolhido' })

  it('in fullscreen, it opens as inline: closed, the Filme escolhido and each line', () => {
    closed(CLOSED, { inFullscreen: true })
    expect(
      screen.getByText(new RegExp(`^${view.closed}`, 'u')).textContent,
    ).toBe('Sessão fechada · Filme escolhido: As Horas Lentas')
    // Said once, under the request; the chosen film's card keeps only its
    // label (#351).
    expect(reactions().map((list) => list.textContent)).toEqual([
      'BVocê: previsto 8,3 · deu 6 de 10IIara: gostou',
    ])
    const card = screen.getByRole('article', { name: /As Horas Lentas/u })
    expect(
      within(card).getByRole('heading', { name: 'Filme escolhido' }),
    ).toBeTruthy()
    // The lines name every Presente: no row of the same faces under them.
    expect(screen.queryByRole('list', { name: view.attendees })).toBeNull()
  })

  it('an open Cartaz keeps the Presentes in the legend', () => {
    render(<BillboardView result={shown} host={fakeHost(json({}))} />)
    expect(
      within(screen.getByRole('list', { name: view.attendees }))
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['BVocê', 'IIara'])
  })

  it('without fullscreen, the same; a chosen film with a block of its own says its lines once', () => {
    closed(CHOSEN_OUTSIDE)
    expect(
      screen.getByText(new RegExp(`^${view.closed}`, 'u')).textContent,
    ).toBe('Sessão fechada · Filme escolhido: Curta da Madrugada')
    expect(reactions()).toHaveLength(1)
    // The lines come later, in the chosen film's block: the legend keeps
    // the Presentes.
    expect(screen.getByRole('list', { name: view.attendees })).toBeTruthy()
  })

  it('without fullscreen, a chosen film with a card says its lines once too', () => {
    closed(CLOSED)
    expect(reactions()).toHaveLength(1)
    expect(screen.queryByRole('list', { name: view.attendees })).toBeNull()
  })
})

describe('Enviar', () => {
  it('records the reply with answer_billboard and asks the chat to regenerate', async () => {
    const host = fakeHost(json(REPLY))
    render(<BillboardView result={shown} host={host} />)

    await swapFirstAndSend()

    expect(host.callTool).toHaveBeenCalledWith('answer_billboard', {
      session: MODEL.session,
      text: '#cartaz 2026-11-20-iara v2\n1 tt9000104 · trocar\n',
    })
    expect(host.callTool).toHaveBeenCalledTimes(1)
    // A host without model context: still her words alone; Claude reads
    // what was recorded from the Session (#277).
    expect(host.sendMessage).toHaveBeenCalledExactlyOnceWith(
      `Troquei As Horas Lentas. Refaz a lista mantendo o resto?\n${TAG}`,
    )
    expect(status()).toBe(SEND_STATUS.regenerating)
  })

  it('her words in the chat, the ids in the model’s context', async () => {
    const updateContext = vi.fn<NonNullable<Host['updateContext']>>(() =>
      Promise.resolve({}),
    )
    const host = { ...fakeHost(json(REPLY)), updateContext }
    render(<BillboardView result={shown} host={host} />)

    await swapFirstAndSend()

    expect(updateContext).toHaveBeenCalledExactlyOnceWith(CONTEXT)
    expect(host.sendMessage).toHaveBeenCalledExactlyOnceWith(
      `Troquei As Horas Lentas. Refaz a lista mantendo o resto?\n${TAG}`,
    )
  })

  it('the same reply goes once; a new mark can go again', async () => {
    const host = fakeHost(json(REPLY))
    render(<BillboardView result={shown} host={host} />)
    const user = await swapFirstAndSend()

    const sent = screen.getByRole('button', { name: copy.sent })
    expect((sent as HTMLButtonElement).disabled).toBe(true)
    await user.click(sent)
    expect(host.callTool).toHaveBeenCalledTimes(1)

    await user.click(card(2).getByRole('button', { name: 'Trocar' }))
    await user.click(screen.getByRole('button', { name: copy.send }))
    expect(host.callTool).toHaveBeenCalledTimes(2)
    // The second message says it replaces the first (#277).
    expect(host.sendMessage).toHaveBeenLastCalledWith(
      expect.stringMatching(new RegExp(`^${AGAIN} Troquei`, 'u')),
    )
  })

  it('a send the chat never heard of is not replaced by the next', async () => {
    const host = fakeHost(json(REPLY), { isError: true })
    render(<BillboardView result={shown} host={host} />)
    const user = await swapFirstAndSend()
    await user.click(card(2).getByRole('button', { name: 'Trocar' }))
    await user.click(screen.getByRole('button', { name: copy.send }))
    expect(host.sendMessage).toHaveBeenLastCalledWith(
      expect.stringMatching(/^Troquei/u),
    )
  })

  it('a model context that fails still sends her words', async () => {
    const updateContext = vi.fn<NonNullable<Host['updateContext']>>(() =>
      Promise.reject(new Error('sem contexto')),
    )
    const host = { ...fakeHost(json(REPLY)), updateContext }
    render(<BillboardView result={shown} host={host} />)
    await swapFirstAndSend()
    expect(host.sendMessage).toHaveBeenCalledExactlyOnceWith(
      `Troquei As Horas Lentas. Refaz a lista mantendo o resto?\n${TAG}`,
    )
    expect(status()).toBe(SEND_STATUS.regenerating)
  })
})

describe('Enviar, stars, comments and refusals', () => {
  it('stars alone are recorded, without a chat message', async () => {
    const host = fakeHost(json({ ...REPLY, regenerate: false, keep: [] }))
    const user = userEvent.setup()
    render(<BillboardView result={shown} host={host} />)

    await user.click(card(1).getByRole('button', { name: '4 de 5' }))
    await user.click(screen.getByRole('button', { name: copy.send }))

    expect(host.sendMessage).not.toHaveBeenCalled()
    expect(status()).toBe(view.recorded)
  })

  it('a comment goes to the chat without regenerating', async () => {
    const host = fakeHost(
      json({
        ...REPLY,
        regenerate: false,
        comments: [{ position: 1, id: 'tt9000104', title: null, comment: 'x' }],
      }),
    )
    render(<BillboardView result={shown} host={host} />)
    await swapFirstAndSend()
    expect(status()).toBe(SEND_STATUS.toChat)
  })

  it("says the engine's refusal in plain words, and Enviar tries again", async () => {
    const refused = json(
      { error: { code: 'closed_session', message: 'Sessão fechada.' } },
      true,
    )
    const host = fakeHost(refused)
    render(<BillboardView result={shown} host={host} />)
    await swapFirstAndSend()
    expect(status()).toBe(view.failed('closed_session'))
    expect(screen.getByRole('button', { name: copy.retry })).toBeTruthy()
    expect(screen.queryByRole('button', { name: copy.copy })).toBeNull()
    expect(host.sendMessage).not.toHaveBeenCalled()
  })

  it('a host that cannot call the tool offers Copiar, only then', async () => {
    render(
      <BillboardView result={shown} host={fakeHost(new Error('sem proxy'))} />,
    )
    expect(screen.queryByRole('button', { name: copy.copy })).toBeNull()
    await swapFirstAndSend()
    expect(status()).toBe(view.unavailable)
    expect(
      within(screen.getByRole('region', { name: copy.bar })).getByRole(
        'button',
        { name: copy.copy },
      ),
    ).toBeTruthy()
  })
})

describe('Enviar, a message refused and one send at a time', () => {
  it('recorded but the message did not go: says so', async () => {
    const refusedMessage = fakeHost(json(REPLY), { isError: true })
    render(<BillboardView result={shown} host={refusedMessage} />)
    await swapFirstAndSend()
    expect(status()).toBe(SEND_STATUS.notNotified)
    cleanup()

    render(
      <BillboardView
        result={shown}
        host={fakeHost(json(REPLY), new Error('fechado'))}
      />,
    )
    await swapFirstAndSend()
    expect(status()).toBe(SEND_STATUS.notNotified)
  })

  it('one send at a time', async () => {
    let answer: (result: ToolResult) => void = () => {}
    const host = {
      ...fakeHost(json(REPLY)),
      callTool: vi.fn<Host['callTool']>(
        () => new Promise((resolve) => (answer = resolve)),
      ),
    }
    render(<BillboardView result={shown} host={host} />)
    const user = await swapFirstAndSend()
    expect(status()).toBe(view.sending)
    await user.click(screen.getByRole('button', { name: copy.send }))
    expect(host.callTool).toHaveBeenCalledTimes(1)
    await act(async () => answer(json(REPLY)))
    expect(status()).toBe(SEND_STATUS.regenerating)
  })
})

const people = MODEL.attendees

describe('the chat follow-up message', () => {
  it('her words first, the Cartaz’s tag, and the detail apart', () => {
    const message = replyMessage(
      {
        ...REPLY,
        keep: [],
        dropped: [
          {
            position: 1,
            id: 'tt1',
            title: 'Cais 2',
            cause: 'swapped' as const,
          },
        ],
        seen: [
          {
            person: 'iara',
            film: 'tt2',
            title: 'Fronteira',
            rating: 4,
            new: true,
          },
          {
            person: 'bruno',
            film: 'tt2',
            title: 'Fronteira',
            rating: null,
            new: true,
          },
        ],
        addition: 'chegou\n\n\n\na Ana\u200b',
        comments: [
          {
            position: 2,
            id: 'tt2',
            title: 'Sal\ne Ferrugem',
            comment: 'lindo',
          },
          { position: 3, id: 'tt3', title: null, comment: '  ' },
        ],
      },
      people,
    )
    expect(message?.text).toBe(
      'Troquei Cais 2. Eu e Iara já vimos Fronteira (Iara deu 8). ' +
        'Acrescentei: “chegou a Ana”. Sobre Sal e Ferrugem: “lindo”. Refaz a lista?\n' +
        TAG,
    )
    expect(message?.text).not.toMatch(/tt\d|answer_billboard/u)
    expect(message?.context.split('\n').slice(1)).toEqual([
      'refazer · manter: nenhum',
      'acrescentar: chegou a Ana',
      'comentário 2 tt2 (Sal e Ferrugem): lindo',
    ])
  })
})

describe('the chat follow-up message, for the Dono and her Climas', () => {
  it('the Dono alone: Já vi, with her note', () => {
    const message = replyMessage(
      {
        ...REPLY,
        dropped: [],
        seen: [
          {
            person: 'bruno',
            film: 'tt2',
            title: 'Fronteira',
            rating: 4.5,
            new: true,
          },
        ],
      },
      people,
    )
    expect(message?.text.split('\n')[0]).toBe(
      'Já vi Fronteira (nota 9). Refaz a lista mantendo o resto?',
    )
  })

  it('the Climas the Dono chose, or nenhum', () => {
    const clima = (moods: string[]) =>
      replyMessage({ ...REPLY, keep: [], moods }, people)
    expect(clima(['leve', 'pra rir'])?.context.split('\n').slice(1)).toEqual([
      'refazer · manter: nenhum',
      'clima: leve, pra rir',
    ])
    expect(clima(['leve', 'pra rir'])?.text).toContain(
      'Quero o clima leve e pra rir. Refaz a lista?',
    )
    expect(clima([])?.context.split('\n').slice(1)).toEqual([
      'refazer · manter: nenhum',
      'clima: nenhum',
    ])
  })
})

describe('the chat follow-up message, for others who saw it', () => {
  it('others who saw it, by name or slug, and films without a title', () => {
    const message = replyMessage(
      {
        ...REPLY,
        keep: ['tt9000105'],
        moods: [],
        dropped: [
          { position: 3, id: 'tt3', title: null, cause: 'swapped' as const },
        ],
        seen: [
          {
            person: 'teo',
            film: 'tt2',
            title: 'Fronteira',
            rating: 3,
            new: true,
          },
          {
            person: 'iara',
            film: 'tt5',
            title: 'Cais',
            rating: null,
            new: true,
          },
          {
            person: 'teo',
            film: 'tt5',
            title: 'Cais',
            rating: null,
            new: true,
          },
        ],
        comments: [
          { position: 4, id: 'tt4', title: null, comment: 'curto' },
          { position: 5, id: 'tt5', title: 'Cais' },
        ],
      },
      people,
    )
    expect(message?.text.split('\n')[0]).toBe(
      'Troquei o filme 3. teo já viu Fronteira (nota 6). ' +
        'Iara e teo já viram Cais. Tirei o clima. ' +
        'Sobre o filme 4: “curto”. Refaz a lista?',
    )
    expect(message?.context.split('\n').slice(1)).toEqual([
      'refazer · manter: tt9000105',
      'clima: nenhum',
      'comentário 4 tt4: curto',
    ])
  })
})

describe('the chat follow-up message, alone, none or long', () => {
  it('a comment alone, without a redo', () => {
    const message = replyMessage(
      {
        ...REPLY,
        regenerate: false,
        dropped: [],
        comments: [{ position: 1, id: 'tt1', title: 'Cais', comment: 'bom' }],
      },
      people,
    )
    expect(message?.text.split('\n')[0]).toBe('Sobre Cais: “bom”.')
  })

  it('none when there is no follow-up', () => {
    expect(
      replyMessage({ ...REPLY, regenerate: false, comments: [] }, people),
    ).toBeNull()
  })

  it('at most the 8,000 characters a ui/message takes, the tag kept', () => {
    const long = replyMessage({ ...REPLY, addition: 'a'.repeat(9000) }, people)
    expect(long?.text).toHaveLength(8000)
    expect(long?.text.endsWith(`\n${TAG}`)).toBe(true)
    expect(long?.context).toHaveLength(8000)
  })

  it('a second send of the version says it replaces the first', () => {
    const again = replyMessage(REPLY, people, true)
    expect(again?.text.split('\n')[0]).toBe(
      `${AGAIN} Troquei As Horas Lentas. Refaz a lista mantendo o resto?`,
    )
    expect(again?.context.split('\n')[0]).toMatch(/substitui a anterior:$/u)
  })
})

/** A fake ext-apps `App`: the host's side of the bridge. */
function fakeApp(context: Record<string, unknown> | undefined) {
  const app = {
    ontoolresult: undefined as ((r: ToolResult) => void) | undefined,
    onhostcontextchanged: undefined as
      | ((c: Record<string, unknown>) => void)
      | undefined,
    getHostContext: () => context,
    getHostCapabilities: () => ({ updateModelContext: { text: {} } }),
    callServerTool: vi.fn<() => Promise<ToolResult>>(() =>
      Promise.resolve(json(REPLY)),
    ),
    sendMessage: vi.fn<() => Promise<object>>(() => Promise.resolve({})),
    updateModelContext: vi.fn<() => Promise<object>>(() => Promise.resolve({})),
    requestDisplayMode: vi.fn<() => Promise<object>>(() =>
      Promise.reject(new Error('não')),
    ),
  }
  return app
}

describe('mountView', () => {
  it('renders the tool result the host sends, with its theme', async () => {
    const app = fakeApp({ theme: 'dark' })
    const root = document.body.appendChild(document.createElement('div'))
    const connect = vi.fn<() => Promise<void>>(() => Promise.resolve())

    await act(() => mountView(app as unknown as ViewApp, root, connect))
    expect(connect).toHaveBeenCalled()
    expect(within(root).getByText(view.loading)).toBeTruthy()
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(document.documentElement.style.colorScheme).toBe('dark')

    await act(async () => app.ontoolresult?.(shown))
    expect(within(root).getAllByRole('article')).toHaveLength(2)

    await act(async () => app.onhostcontextchanged?.({ theme: 'light' }))
    expect(document.documentElement.dataset.theme).toBe('light')

    await swapFirstAndSend()
    expect(app.callServerTool).toHaveBeenCalledWith({
      name: 'answer_billboard',
      arguments: {
        session: MODEL.session,
        text: '#cartaz 2026-11-20-iara v2\n1 tt9000104 · trocar\n',
      },
    })
    expect(app.sendMessage).toHaveBeenCalledWith({
      role: 'user',
      content: [
        { type: 'text', text: expect.stringMatching(/pelo Cartaz · v2/) },
      ],
    })
    expect(app.updateModelContext).toHaveBeenCalledWith({
      content: [
        { type: 'text', text: expect.stringMatching(/^Resposta do Cartaz/) },
      ],
    })
    root.remove()
  })
})

describe('mountView, the safe area', () => {
  it('the host’s safe area becomes the bar’s inset', async () => {
    const app = fakeApp({
      displayMode: 'fullscreen',
      safeAreaInsets: { top: 0, right: 0, bottom: 96, left: 0 },
    })
    const root = document.body.appendChild(document.createElement('div'))
    await act(() =>
      mountView(app as unknown as ViewApp, root, () => Promise.resolve()),
    )
    const style = document.documentElement.style
    expect(style.getPropertyValue('--host-inset-bottom')).toBe('96px')
    await act(async () =>
      app.onhostcontextchanged?.({
        safeAreaInsets: { top: 8, right: 0, bottom: 0, left: 0 },
      }),
    )
    expect(style.getPropertyValue('--host-inset-bottom')).toBe('0px')
    expect(style.getPropertyValue('--host-inset-top')).toBe('8px')
    root.remove()
  })
})

describe('mountView, inline', () => {
  it('inline, the compact card: one line per film, Marcar asks for fullscreen', async () => {
    const app = fakeApp({
      displayMode: 'inline',
      availableDisplayModes: ['inline', 'fullscreen'],
    })
    const root = document.body.appendChild(document.createElement('div'))
    await act(() =>
      mountView(app as unknown as ViewApp, root, () => Promise.resolve()),
    )
    await act(async () => app.ontoolresult?.(shown))

    expect(within(root).queryByRole('article')).toBeNull()
    const films = within(root).getByRole('list', { name: view.list })
    expect(
      within(films)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['1As Horas Lentas2021 · 1h44', '2Sal & Ferrugem'])
    // What left and what came in with this version.
    expect(
      within(root).getByText(
        'Saiu: Sessão Maldita (Iara já viu) · entrou: Sal & Ferrugem',
      ),
    ).toBeTruthy()

    // Nothing marked yet: Marcar alone, no Enviar to send nothing.
    expect(within(root).queryByRole('button', { name: copy.send })).toBeNull()
    const user = userEvent.setup()
    await user.click(within(root).getByRole('button', { name: view.mark }))
    expect(app.requestDisplayMode).toHaveBeenCalledWith({ mode: 'fullscreen' })
    expect(document.documentElement.dataset.theme).toBeUndefined()
    root.remove()
  })

  it('inline and fullscreen take the theme’s colour scheme, so a canvas behind has its polarity', async () => {
    const modes = { availableDisplayModes: ['inline', 'fullscreen'] }
    const app = fakeApp({ theme: 'dark', displayMode: 'inline', ...modes })
    const root = document.body.appendChild(document.createElement('div'))
    await act(() =>
      mountView(app as unknown as ViewApp, root, () => Promise.resolve()),
    )
    const style = document.documentElement.style
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(style.colorScheme).toBe('dark')
    await act(async () =>
      app.onhostcontextchanged?.({ displayMode: 'fullscreen', theme: 'light' }),
    )
    expect(style.colorScheme).toBe('light')
    root.remove()
  })
})

describe('mountView, the floor', () => {
  const floors = async (context: Record<string, unknown>) => {
    const app = fakeApp(context)
    const root = document.body.appendChild(document.createElement('div'))
    await act(() =>
      mountView(app as unknown as ViewApp, root, () => Promise.resolve()),
    )
    const style = document.documentElement.style
    const read = () => [
      style.getPropertyValue('--view-floor'),
      style.getPropertyValue('--card-floor'),
    ]
    return { app, root, read }
  }

  it('the host’s background is the frame’s floor, edge to edge', async () => {
    const { root, read } = await floors({
      theme: 'dark',
      styles: { variables: { '--color-background-primary': '#262624' } },
    })
    expect(read()).toEqual(['#262624', ''])
    root.remove()
  })

  it('dark without it, the card lays the ground; light, nothing', async () => {
    const { app, root, read } = await floors({ theme: 'dark' })
    expect(read()).toEqual(['', 'var(--color-ground)'])
    await act(async () => app.onhostcontextchanged?.({ theme: 'light' }))
    expect(read()).toEqual(['', ''])
    root.remove()
  })
})

describe('mountView, Enviar in fullscreen', () => {
  const fullscreenSend = async (answer: () => Promise<object>) => {
    const modes = { availableDisplayModes: ['inline', 'fullscreen'] }
    const app = fakeApp({ displayMode: 'fullscreen', ...modes })
    app.requestDisplayMode.mockImplementation(answer)
    const root = document.body.appendChild(document.createElement('div'))
    await act(() =>
      mountView(app as unknown as ViewApp, root, () => Promise.resolve()),
    )
    await act(async () => app.ontoolresult?.(shown))
    await swapFirstAndSend()
    return { app, root }
  }

  it('a regenerate asks the host for the chat, where the new list comes', async () => {
    const { app, root } = await fullscreenSend(() =>
      Promise.resolve({ mode: 'inline' }),
    )
    expect(app.requestDisplayMode).toHaveBeenCalledExactlyOnceWith({
      mode: 'inline',
    })
    expect(status()).toBe(SEND_STATUS.regenerating)
    root.remove()
  })

  it('a host that keeps the fullscreen: she is asked to close it', async () => {
    const { root } = await fullscreenSend(() =>
      Promise.reject(new Error('não')),
    )
    expect(status()).toBe(SEND_STATUS.closeFullscreen)
    root.remove()
  })

  it('a host that answers with the fullscreen still: the same', async () => {
    const { root } = await fullscreenSend(() =>
      Promise.resolve({ mode: 'fullscreen' }),
    )
    expect(status()).toBe(SEND_STATUS.closeFullscreen)
    root.remove()
  })
})

describe('mountView, from fullscreen back inline', () => {
  it('the marks made in fullscreen go with Enviar back inline', async () => {
    const modes = { availableDisplayModes: ['inline', 'fullscreen'] }
    const app = fakeApp({ displayMode: 'fullscreen', ...modes })
    const root = document.body.appendChild(document.createElement('div'))
    await act(() =>
      mountView(app as unknown as ViewApp, root, () => Promise.resolve()),
    )
    await act(async () => app.ontoolresult?.(shown))

    const user = userEvent.setup()
    expect(within(root).queryByRole('button', { name: view.mark })).toBeNull()
    await user.click(card(1).getByRole('button', { name: 'Trocar' }))
    expect(within(root).getByText('1 Trocar')).toBeTruthy()

    await act(async () =>
      app.onhostcontextchanged?.({ displayMode: 'inline', ...modes }),
    )
    expect(within(root).queryByRole('article')).toBeNull()
    // Inline names what goes with Enviar.
    expect(within(root).getByText('Trocar: As Horas Lentas')).toBeTruthy()
    await user.click(within(root).getByRole('button', { name: copy.send }))
    expect(app.callServerTool).toHaveBeenCalledWith({
      name: 'answer_billboard',
      arguments: {
        session: MODEL.session,
        text: '#cartaz 2026-11-20-iara v2\n1 tt9000104 · trocar\n',
      },
    })
    // The marked film keeps its row, with its tag (#277).
    const films = within(root).getByRole('list', { name: view.list })
    expect(within(films).getAllByRole('listitem')[0]!.textContent).toBe(
      '1As Horas LentasTrocar2021 · 1h44',
    )
    // Sent: it says so, and the one action is to mark again.
    expect(within(root).getByText(view.sentTitle)).toBeTruthy()
    expect(within(root).queryByRole('button', { name: copy.send })).toBeNull()
    expect(
      within(root).getByRole('button', { name: view.markAgain }),
    ).toBeTruthy()
    root.remove()
  })
})

describe('mountView, Limpar inline', () => {
  it('inline, Limpar takes every mark off', async () => {
    const modes = { availableDisplayModes: ['inline', 'fullscreen'] }
    const app = fakeApp({ displayMode: 'fullscreen', ...modes })
    const root = document.body.appendChild(document.createElement('div'))
    await act(() =>
      mountView(app as unknown as ViewApp, root, () => Promise.resolve()),
    )
    await act(async () => app.ontoolresult?.(shown))
    const user = userEvent.setup()
    await user.click(card(1).getByRole('button', { name: 'Trocar' }))
    await act(async () =>
      app.onhostcontextchanged?.({ displayMode: 'inline', ...modes }),
    )

    await user.click(within(root).getByRole('button', { name: copy.clear }))

    expect(within(root).queryByText('Trocar: As Horas Lentas')).toBeNull()
    expect(within(root).queryByRole('button', { name: copy.send })).toBeNull()
    root.remove()
  })
})

describe('mountView, Mostrar QR (#396)', () => {
  const sessionLink = 'https://cinema.example/participar?sessao=x&chave=y'

  it('shows the Link da Sessão only when the result carries it', () => {
    render(<BillboardView result={shown} host={fakeHost(json({}))} />)
    expect(screen.queryByRole('button', { name: 'Mostrar QR' })).toBeNull()
    cleanup()
    render(
      <BillboardView
        result={json({ session: MODEL.session, billboard: MODEL, sessionLink })}
        host={fakeHost(json({}))}
      />,
    )
    expect(screen.getByRole('button', { name: 'Mostrar QR' })).toBeTruthy()
  })

  it('inline, asks for the fullscreen and keeps the code open in it', async () => {
    // jsdom has no modal dialog; Chrome opens it in session-qr.stories.tsx.
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value(this: HTMLDialogElement) {
        this.setAttribute('open', '')
      },
    })
    onTestFinished(() => {
      Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
    })
    const app = fakeApp({
      displayMode: 'inline',
      availableDisplayModes: ['inline', 'fullscreen'],
    })
    const root = document.body.appendChild(document.createElement('div'))
    await act(() =>
      mountView(app as unknown as ViewApp, root, () => Promise.resolve()),
    )
    await act(async () =>
      app.ontoolresult?.(
        json({ session: MODEL.session, billboard: MODEL, sessionLink }),
      ),
    )

    const user = userEvent.setup()
    await user.click(within(root).getByRole('button', { name: 'Mostrar QR' }))
    expect(app.requestDisplayMode).toHaveBeenCalledWith({ mode: 'fullscreen' })
    await act(async () =>
      app.onhostcontextchanged?.({ displayMode: 'fullscreen' }),
    )
    expect(within(root).getAllByRole('article')).toHaveLength(2)
    expect(
      within(root).getByRole('dialog', { name: 'Entrem pelo celular' }),
    ).toBeTruthy()
    root.remove()
  })
})
