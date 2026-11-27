// The Cartaz's MCP Apps view as the host gets it (#111): the single HTML
// file `billboard-view.ts` builds, the same one committed for the MCP
// server, run in jsdom with a fake host on the other side of `postMessage`.
// The frame has no storage (T3 Code's has none), so the Cartaz must work
// keeping nothing.

import { readFileSync } from 'node:fs'
import { within } from '@testing-library/dom'
import { billboardText } from '@filmes/engine/billboard-text'
import { JSDOM } from 'jsdom'
import { beforeAll, describe, expect, it } from 'vite-plus/test'
import { MODEL } from '../src/ui/billboard.fixture.ts'
import { SEND_STATUS } from '../src/ui/billboard-send.copy.ts'
import { BILLBOARD } from '../src/ui/billboard.copy.ts'
import {
  buildBillboardView,
  GENERATED,
  generatedModule,
} from './billboard-view.ts'

let html = ''
beforeAll(async () => {
  html = await buildBillboardView()
}, 60_000)

type Message = {
  jsonrpc: '2.0'
  id?: number
  method?: string
  params?: Record<string, unknown>
}

const toolResult = (value: unknown) => ({
  content: [{ type: 'text', text: JSON.stringify(value) }],
})

/** The view in a frame-like page, and the host that answers it. */
function open(options: { toolsFail?: boolean } = {}) {
  const sent: Message[] = []
  const copied: string[] = []
  const waiting = new Map<string, (message: Message) => void>()
  let view: JSDOM['window'] | undefined
  const reply = (data: unknown) =>
    view?.dispatchEvent(
      new view.MessageEvent('message', {
        data,
        source: view as unknown as Window,
      }),
    )
  const answers: Record<string, (m: Message) => unknown> = {
    'ui/initialize': () => ({
      protocolVersion: '2026-01-26',
      hostInfo: { name: 'host', version: '1' },
      hostCapabilities: { serverTools: {}, message: {} },
      hostContext: { theme: 'dark', displayMode: 'inline' },
    }),
    'tools/call': () =>
      toolResult({
        session: { id: MODEL.session, file: 'x.md' },
        version: 2,
        currentVersion: 2,
        regenerate: true,
        keep: ['tt9000105'],
        dropped: [],
        addition: null,
        moods: null,
        comments: [],
        stars: [],
        seen: [],
        warnings: [],
      }),
    'ui/message': () => ({}),
  }
  const host = (message: Message) => {
    sent.push(message)
    if (message.method === 'ui/notifications/initialized')
      reply({
        jsonrpc: '2.0',
        method: 'ui/notifications/tool-result',
        params: toolResult({
          session: MODEL.session,
          films: 2,
          warnings: [],
          billboard: MODEL,
        }),
      })
    if (message.method === 'tools/call' && options.toolsFail) {
      reply({
        jsonrpc: '2.0',
        id: message.id,
        error: { code: -32601, message: 'sem ferramentas' },
      })
      return
    }
    const answer = message.method && answers[message.method]
    if (answer && message.id !== undefined)
      reply({ jsonrpc: '2.0', id: message.id, result: answer(message) })
    waiting.get(message.method ?? '')?.(message)
  }
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://sandbox.example/',
    beforeParse(window) {
      // The host's end of the bridge: what the view posts to its parent.
      window.postMessage = (message: Message) => host(message)
      // The host sizes the frame from it; jsdom has none.
      window.ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new window.DOMException('sem storage', 'SecurityError')
        },
      })
      Object.defineProperty(window.navigator, 'clipboard', {
        value: { writeText: async (text: string) => void copied.push(text) },
      })
    },
  })
  view = dom.window
  const page = within(dom.window.document.body)
  /** The next message of `method` the view sends. */
  const next = (method: string) =>
    new Promise<Message>((resolve) => waiting.set(method, resolve))
  return { dom, page, sent, copied, next }
}

describe('the bundled view', () => {
  it('is the file the MCP server serves', () => {
    expect(readFileSync(GENERATED, 'utf8')).toBe(generatedModule(html))
  })

  it('fits the default CSP of MCP Apps: everything inline, no fonts', () => {
    const { document } = new JSDOM(html).window
    const scripts = [...document.querySelectorAll('script')]
    expect(scripts.map((s) => s.src)).toEqual([''])
    expect(document.querySelectorAll('link')).toHaveLength(0)
    const css = [...document.querySelectorAll('style')]
      .map((s) => s.textContent)
      .join('')
    expect(css).not.toMatch(/@font-face|@import|url\(/u)
  })

  it('renders the Cartaz the host sends, in its theme, keeping nothing', async () => {
    const { dom, page } = open()

    const cards = await page.findAllByRole('article')

    expect(cards).toHaveLength(2)
    expect(dom.window.document.documentElement.dataset.theme).toBe('dark')
    expect(page.queryByText(BILLBOARD.reply.kept)).toBeNull()
    dom.window.close()
  })
})

describe('the bundled view, when the host cannot send', () => {
  it('Copiar pro chat, when the host cannot send, gives exactly the #cartaz text', async () => {
    const { dom, page, copied } = open({ toolsFail: true })
    const [first] = await page.findAllByRole('article')

    within(first!).getByRole('button', { name: 'Trocar' }).click()
    await page.findByText('1 Trocar')
    expect(
      page.queryByRole('button', { name: BILLBOARD.reply.copy }),
    ).toBeNull()
    page.getByRole('button', { name: BILLBOARD.reply.send }).click()
    await page.findByText(BILLBOARD.view.unavailable)
    page.getByRole('button', { name: BILLBOARD.reply.copy }).click()
    await page.findByText(BILLBOARD.reply.copied)

    expect(copied).toEqual([
      billboardText({
        session: MODEL.session,
        version: MODEL.version,
        attendees: ['bruno', 'iara'],
        addition: '',
        films: [
          {
            position: 1,
            id: 'tt9000104',
            seen: [],
            ratings: {},
            thoughts: {},
            swap: true,
            stars: 0,
            comment: '',
          },
          {
            position: 2,
            id: 'tt9000105',
            seen: [],
            ratings: {},
            thoughts: {},
            swap: false,
            stars: 0,
            comment: '',
          },
        ],
      }),
    ])
    expect(copied[0]).toBe('#cartaz 2026-11-20-iara v2\n1 tt9000104 · trocar\n')
    dom.window.close()
  })
})

describe('the bundled view, sending through the host', () => {
  it('Enviar calls answer_billboard through the host, then tells Claude', async () => {
    const { dom, page, next } = open()
    const [first] = await page.findAllByRole('article')
    const call = next('tools/call')
    const message = next('ui/message')

    within(first!).getByRole('button', { name: 'Trocar' }).click()
    await page.findByText('1 Trocar')
    page.getByRole('button', { name: BILLBOARD.reply.send }).click()

    expect((await call).params).toMatchObject({
      name: 'answer_billboard',
      arguments: {
        session: MODEL.session,
        text: '#cartaz 2026-11-20-iara v2\n1 tt9000104 · trocar\n',
      },
    })
    expect((await message).params).toEqual({
      role: 'user',
      content: [
        {
          type: 'text',
          // This host takes no model context: the detail follows her
          // words.
          text:
            'Refaz a lista mantendo o resto?\n' +
            '(enviado pelo Cartaz · 2026-11-20-iara v2)\n' +
            'Resposta do Cartaz 2026-11-20-iara v2, já gravada por answer_billboard (não chame de novo):\n' +
            'refazer · manter: tt9000105',
        },
      ],
    })
    expect(await page.findByText(SEND_STATUS.regenerating)).toBeTruthy()
    dom.window.close()
  })
})
