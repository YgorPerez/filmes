// The Cartaz [billboard] as an MCP Apps view (#111): the host (Claude,
// T3 Code) renders `ui://filmes/cartaz.html` under the `billboard` tool's
// result and hands that result to the view. The view renders the same
// component as the Session's page (`ui/billboard.tsx`). Enviar records the
// reply with `answer_billboard`, called through the host, and when a film
// left or something was written (acrescentar, comments) tells Claude with a
// `ui/message`, since the regenerate and the reading of the free text are
// his. Copiar pro chat gives the `#cartaz` text, as on the web.
//
// `mountView` takes the `App` of `@modelcontextprotocol/ext-apps` (or a
// fake in the tests) so that this file never reaches the network or the
// parent window by itself.

import type { Billboard as BillboardModel } from '@filmes/engine'
import { useRef, useState, useSyncExternalStore } from 'react'
import type { App, McpUiHostContext } from '@modelcontextprotocol/ext-apps'
import { createRoot } from 'react-dom/client'
import { Billboard } from '../ui/billboard'
import { BILLBOARD } from '../ui/billboard.copy'
import {
  billboardOf,
  errorOf,
  replyMessage,
  replyOf,
  type ToolResult,
} from './view-model'

/** What the view asks of the host. */
export type Host = {
  readonly callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<ToolResult>
  readonly sendMessage: (text: string) => Promise<{ isError?: boolean }>
  /** Asks for fullscreen; absent when the host has no fullscreen. */
  readonly fullscreen?: () => void
}

const { view } = BILLBOARD

/** Records the reply and, when Claude has something to do, tells him.
 * Gives the status line and whether the reply was recorded. */
async function send(
  host: Host,
  billboard: BillboardModel,
  text: string,
): Promise<{ status: string; recorded: boolean }> {
  let result: ToolResult
  try {
    result = await host.callTool('answer_billboard', {
      session: billboard.session,
      text,
    })
  } catch {
    return { status: view.unavailable, recorded: false }
  }
  const reply = replyOf(result)
  if (reply === null)
    return { status: view.failed(errorOf(result)), recorded: false }
  const message = replyMessage(reply)
  if (message === null) return { status: view.recorded, recorded: true }
  const told = await host.sendMessage(message).then(
    (answer) => !answer.isError,
    () => false,
  )
  if (!told) return { status: view.notNotified, recorded: true }
  return {
    status: reply.regenerate ? view.regenerating : view.toClaude,
    recorded: true,
  }
}

function Cartaz({
  billboard,
  host,
}: {
  billboard: BillboardModel
  host: Host
}) {
  const [sent, setSent] = useState(false)
  const sending = useRef(false)

  const onSend = async (text: string) => {
    if (sending.current) return view.sending
    sending.current = true
    const { status, recorded } = await send(host, billboard, text)
    sending.current = false
    if (recorded) setSent(true)
    return status
  }

  return <Billboard billboard={billboard} onSend={onSend} sent={sent} />
}

/** The view for the last tool result the host gave, or the wait for it. */
export function BillboardView({
  result,
  host,
}: {
  result: ToolResult | null
  host: Host
}) {
  if (result === null)
    return <p className="p-md text-meta text-ink-2">{view.loading}</p>
  const shown = billboardOf(result)
  return (
    <main className="flex flex-col gap-sm p-sm">
      {host.fullscreen && (
        <button
          type="button"
          onClick={host.fullscreen}
          className="inline-flex min-h-touch cursor-pointer items-center self-end rounded-pill border border-rule bg-surface px-[22px] text-button text-ink"
        >
          {view.fullscreen}
        </button>
      )}
      {'billboard' in shown ? (
        <Cartaz
          key={`${shown.billboard.session}:${shown.billboard.version}`}
          billboard={shown.billboard}
          host={host}
        />
      ) : (
        <p role="alert" className="text-meta">
          {shown.error}
        </p>
      )}
    </main>
  )
}

/** The part of ext-apps' `App` the view uses. */
export type ViewApp = Pick<
  App,
  | 'ontoolresult'
  | 'onhostcontextchanged'
  | 'getHostContext'
  | 'callServerTool'
  | 'sendMessage'
  | 'requestDisplayMode'
>

type HostContext = McpUiHostContext

/** Renders the view in `root` and connects it to the host (`connect`):
 * the tool result, the host's theme (`data-theme`, which `ui/tokens.css`
 * follows) and its display modes. */
export async function mountView(
  app: ViewApp,
  root: HTMLElement,
  connect: () => Promise<void>,
): Promise<void> {
  let result: ToolResult | null = null
  let context: HostContext = {}
  const listeners = new Set<() => void>()
  const changed = () => {
    for (const listener of listeners) listener()
  }
  const subscribe = (listener: () => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  const setContext = (next: HostContext | undefined) => {
    context = { ...context, ...next }
    if (context.theme) {
      document.documentElement.dataset.theme = context.theme
      document.documentElement.style.colorScheme = context.theme
    }
    changed()
  }

  const callTool = (name: string, args: Record<string, unknown>) =>
    app.callServerTool({ name, arguments: args })
  const sendMessage = (text: string) =>
    app.sendMessage({ role: 'user', content: [{ type: 'text', text }] })
  const fullscreen = () => {
    void app.requestDisplayMode({ mode: 'fullscreen' }).catch(() => {})
  }
  const hostOf = (c: HostContext): Host =>
    c.displayMode !== 'fullscreen' &&
    c.availableDisplayModes?.includes('fullscreen')
      ? { callTool, sendMessage, fullscreen }
      : { callTool, sendMessage }

  // One Host per context, so the snapshot stays the same between changes.
  let cached: { context: HostContext; host: Host } | null = null
  const currentHost = () => {
    if (cached?.context !== context) cached = { context, host: hostOf(context) }
    return cached.host
  }
  function Root() {
    const shown = useSyncExternalStore(subscribe, () => result)
    const host = useSyncExternalStore(subscribe, currentHost)
    return <BillboardView result={shown} host={host} />
  }

  app.ontoolresult = (next) => {
    result = next
    changed()
  }
  app.onhostcontextchanged = setContext
  createRoot(root).render(<Root />)
  await connect()
  setContext(app.getHostContext())
}
