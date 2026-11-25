// @vitest-environment jsdom
// The Cartaz's MCP Apps view (#111) with a fake host: what it shows for the
// `billboard` tool's result, Enviar through `answer_billboard` and the
// message Claude gets, the host's theme and fullscreen. The bundled file in
// a real frame-like page is `scripts/billboard-view.test.ts`.
import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { MODEL } from '../ui/billboard.fixture'
import { BILLBOARD } from '../ui/billboard.copy'
import {
  BillboardView,
  mountView,
  type Host,
  type ViewApp,
} from './billboard-view'
import { replyMessage, type ToolResult } from './view-model'

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
  dropped: [],
  addition: null,
  comments: [],
  stars: [],
  seen: [],
  warnings: [],
}

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

  it("the engine's error when the tool failed", () => {
    const failed = json(
      { error: { code: 'invalid_usage', message: 'Sessão desconhecida' } },
      true,
    )
    render(<BillboardView result={failed} host={fakeHost(json({}))} />)
    expect(screen.getByRole('alert').textContent).toBe('Sessão desconhecida')
  })

  it('the text of a result that is not JSON', () => {
    const odd = { isError: true, content: [{ type: 'text', text: 'falhou' }] }
    render(<BillboardView result={odd} host={fakeHost(json({}))} />)
    expect(screen.getByRole('alert').textContent).toBe('falhou')
  })
})

describe('Enviar', () => {
  it('records the reply with answer_billboard and tells Claude to regenerate', async () => {
    const host = fakeHost(json(REPLY))
    render(<BillboardView result={shown} host={host} />)

    await swapFirstAndSend()

    expect(host.callTool).toHaveBeenCalledWith('answer_billboard', {
      session: MODEL.session,
      text: '#cartaz 2026-11-20-iara v2\n1 tt9000104 · trocar\n',
    })
    expect(host.sendMessage).toHaveBeenCalledWith(
      'Enviei o Cartaz 2026-11-20-iara v2 pela tela; answer_billboard já gravou.\n' +
        'refazer · manter: tt9000105',
    )
    expect(status()).toBe(view.regenerating)
  })

  it('stars alone are recorded, and Claude gets nothing', async () => {
    const host = fakeHost(json({ ...REPLY, regenerate: false, keep: [] }))
    const user = userEvent.setup()
    render(<BillboardView result={shown} host={host} />)

    await user.click(card(1).getByRole('button', { name: '4 de 5' }))
    await user.click(screen.getByRole('button', { name: copy.send }))

    expect(host.sendMessage).not.toHaveBeenCalled()
    expect(status()).toBe(view.recorded)
  })

  it('a comment goes to Claude without a regenerate', async () => {
    const host = fakeHost(
      json({
        ...REPLY,
        regenerate: false,
        comments: [{ position: 1, id: 'tt9000104', title: null, comment: 'x' }],
      }),
    )
    render(<BillboardView result={shown} host={host} />)
    await swapFirstAndSend()
    expect(status()).toBe(view.toClaude)
  })

  it("says the engine's refusal and points to Copiar", async () => {
    const refused = json(
      { error: { code: 'closed_session', message: 'Sessão fechada.' } },
      true,
    )
    const host = fakeHost(refused)
    render(<BillboardView result={shown} host={host} />)
    await swapFirstAndSend()
    expect(status()).toBe(view.failed('Sessão fechada.'))
    expect(host.sendMessage).not.toHaveBeenCalled()
  })

  it('a host that cannot call the tool points to Copiar', async () => {
    render(
      <BillboardView result={shown} host={fakeHost(new Error('sem proxy'))} />,
    )
    await swapFirstAndSend()
    expect(status()).toBe(view.unavailable)
  })

  it('recorded but the message did not go: says so', async () => {
    const refusedMessage = fakeHost(json(REPLY), { isError: true })
    render(<BillboardView result={shown} host={refusedMessage} />)
    await swapFirstAndSend()
    expect(status()).toBe(view.notNotified)
    cleanup()

    render(
      <BillboardView
        result={shown}
        host={fakeHost(json(REPLY), new Error('fechado'))}
      />,
    )
    await swapFirstAndSend()
    expect(status()).toBe(view.notNotified)
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
    expect(status()).toBe(view.regenerating)
  })
})

describe('the message Claude gets', () => {
  it('one line per field, the free text on one line and visible', () => {
    expect(
      replyMessage({
        ...REPLY,
        keep: [],
        addition: 'chegou\n\n\n\na Ana​',
        comments: [
          {
            position: 2,
            id: 'tt2',
            title: 'Sal\ne Ferrugem',
            comment: 'lindo',
          },
          { position: 3, id: 'tt3', title: null, comment: '  ' },
        ],
      }),
    ).toBe(
      'Enviei o Cartaz 2026-11-20-iara v2 pela tela; answer_billboard já gravou.\n' +
        'refazer · manter: nenhum\n' +
        'acrescentar: chegou a Ana\n' +
        'comentário 2 tt2 (Sal e Ferrugem): lindo',
    )
  })

  it('none when Claude has nothing to do', () => {
    expect(
      replyMessage({ ...REPLY, regenerate: false, comments: [] }),
    ).toBeNull()
  })

  it('at most the 8,000 characters a ui/message takes', () => {
    const long = replyMessage({ ...REPLY, addition: 'a'.repeat(9000) })
    expect(long).toHaveLength(8000)
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
    callServerTool: vi.fn<() => Promise<ToolResult>>(() =>
      Promise.resolve(json(REPLY)),
    ),
    sendMessage: vi.fn<() => Promise<object>>(() => Promise.resolve({})),
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
      content: [{ type: 'text', text: expect.stringMatching(/^Enviei/) }],
    })
    root.remove()
  })

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

    const user = userEvent.setup()
    await user.click(within(root).getByRole('button', { name: view.mark }))
    expect(app.requestDisplayMode).toHaveBeenCalledWith({ mode: 'fullscreen' })
    expect(document.documentElement.dataset.theme).toBeUndefined()
    root.remove()
  })

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
    expect(within(root).getByText('1 Trocar marcado')).toBeTruthy()

    await act(async () =>
      app.onhostcontextchanged?.({ displayMode: 'inline', ...modes }),
    )
    expect(within(root).queryByRole('article')).toBeNull()
    await user.click(within(root).getByRole('button', { name: copy.send }))
    expect(app.callServerTool).toHaveBeenCalledWith({
      name: 'answer_billboard',
      arguments: {
        session: MODEL.session,
        text: '#cartaz 2026-11-20-iara v2\n1 tt9000104 · trocar\n',
      },
    })
    root.remove()
  })
})
