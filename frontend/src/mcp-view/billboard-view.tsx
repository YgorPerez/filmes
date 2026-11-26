// The Cartaz [billboard] as an MCP Apps view (#111): the host (Claude,
// T3 Code) renders `ui://filmes/cartaz.html` under the `billboard` tool's
// result and hands that result to the view. The view renders the same
// component as the Session's page (`ui/billboard.tsx`). Enviar records the
// reply with `answer_billboard`, called through the host, and when a film
// left or something was written (acrescentar, comments) tells Claude with a
// `ui/message`, since the regenerate and the reading of the free text are
// his. Copiar pro chat gives the `#cartaz` text, as on the web. When the
// host has a fullscreen, the view starts as the compact inline card, whose
// Marcar asks for it; in fullscreen it is the whole Cartaz with the top and
// the foot fixed. A host without one gets the whole Cartaz inline.
//
// `mountView` (`mount-view.tsx`) connects this view to the host.

import type { Billboard as BillboardModel } from '@filmes/engine'
import { useRef, useState } from 'react'
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
  /** Asks for fullscreen; absent when the host has no fullscreen or the
   * view is in it already. */
  readonly fullscreen?: () => void
  /** The view is in the host's fullscreen. */
  readonly inFullscreen?: boolean
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

  return (
    <Billboard
      billboard={billboard}
      onSend={onSend}
      sent={sent}
      layout={layoutOf(host)}
      onExpand={host.fullscreen}
    />
  )
}

const layoutOf = (host: Host) =>
  host.inFullscreen ? 'fullscreen' : host.fullscreen ? 'inline' : 'page'

/** The view for the last tool result the host gave, or the wait for it. */
export function BillboardView({
  result,
  host,
}: {
  result: ToolResult | null
  host: Host
}) {
  if (result === null)
    return <p className="p-xl text-meta text-ink-2">{view.loading}</p>
  const shown = billboardOf(result)
  return (
    <main className={layoutOf(host) === 'page' ? 'p-2xl' : ''}>
      {'billboard' in shown ? (
        <Cartaz
          key={`${shown.billboard.session}:${shown.billboard.version}`}
          billboard={shown.billboard}
          host={host}
        />
      ) : (
        <p role="alert" className="p-2xl text-meta">
          {shown.error}
        </p>
      )}
    </main>
  )
}
