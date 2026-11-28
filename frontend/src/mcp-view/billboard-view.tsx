// The Cartaz [billboard] as an MCP Apps view (#111): the host (Claude,
// T3 Code) renders `ui://filmes/cartaz.html` under the `billboard` tool's
// result and hands that result to the view. The view renders the same
// component as the Session's page (`ui/billboard.tsx`). Enviar records the
// reply with `answer_billboard`, called through the host, and when a film
// left or something was written (acrescentar, comments) tells the chat:
// a `ui/message` in the Dono's words, and what Claude needs to redo the
// list in his context (`ui/update-model-context`), since the regenerate
// and the reading of the free text are his (#277). The same reply is sent
// once. When Enviar cannot go, Copiar pro chat gives the `#cartaz` text,
// as on the web. When the host has a fullscreen, the view starts as the
// compact inline card, whose Marcar asks for it; in fullscreen it is the
// whole Cartaz with the top and the foot fixed. A host without one gets the
// whole Cartaz inline, capped, on its own ground with the inline card's
// rule and corners where the frame is wide enough for them. After an
// Enviar that redoes the list, the fullscreen gives way to the chat, where
// the new list comes.
//
// `mountView` (`mount-view.tsx`) connects this view to the host.

import type { Billboard as BillboardModel } from '@filmes/engine'
import { useRef, useState } from 'react'
import { Billboard, type SendOutcome } from '../ui/billboard'
import { INLINE_CARD } from '../ui/billboard-frame'
import { SEND_STATUS } from '../ui/billboard-send.copy'
import { BILLBOARD } from '../ui/billboard.copy'
import { Alert } from '../ui/kit/status'
import {
  billboardOf,
  errorCodeOf,
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
  /** Puts text in the model's context for its next turn; absent when the
   * host takes none. */
  readonly updateContext?: (text: string) => Promise<unknown>
  /** Asks for fullscreen; absent when the host has no fullscreen or the
   * view is in it already. */
  readonly fullscreen?: () => void
  /** The view is in the host's fullscreen. */
  readonly inFullscreen?: boolean
  /** Asks the host for the inline card again, in the fullscreen: whether
   * it took it. */
  readonly leaveFullscreen?: () => Promise<boolean>
}

const { view } = BILLBOARD

/** What became of an Enviar, and whether the chat heard of it. */
type Sent = SendOutcome & { readonly told?: boolean }

/** Records the reply and, when needed, tells the chat. `again` when the
 * chat heard of an earlier Enviar of this version. */
async function send(
  host: Host,
  billboard: BillboardModel,
  text: string,
  again: boolean,
): Promise<Sent> {
  let result: ToolResult
  try {
    result = await host.callTool('answer_billboard', {
      session: billboard.session,
      text,
    })
  } catch {
    return { message: view.unavailable, sent: false, copy: true }
  }
  const reply = replyOf(result)
  if (reply === null)
    return { message: view.failed(errorCodeOf(result)), sent: false }
  const message = replyMessage(reply, billboard.attendees, again)
  if (message === null) return { message: view.recorded, sent: true }
  // Without the model context, the bubble still carries only the Dono's
  // words: Claude reads what was recorded from the Session (#277).
  await host.updateContext?.(message.context).catch(() => {})
  const told = await host.sendMessage(message.text).then(
    (answer) => !answer.isError,
    () => false,
  )
  if (!told) return { message: SEND_STATUS.notNotified, sent: true }
  return {
    message: reply.regenerate ? await regenerating(host) : SEND_STATUS.toChat,
    sent: true,
    told: true,
  }
}

/** Where the new list comes: in the chat, which the fullscreen covers, so
 * the view goes back inline first; when the host keeps it, the Dono is
 * asked to close it (#277). */
async function regenerating(host: Host) {
  if (!host.leaveFullscreen) return SEND_STATUS.regenerating
  const left = await host.leaveFullscreen().catch(() => false)
  return left ? SEND_STATUS.regenerating : SEND_STATUS.closeFullscreen
}

function Cartaz({
  billboard,
  sessionLink,
  host,
}: {
  billboard: BillboardModel
  sessionLink: string | null
  host: Host
}) {
  const [sent, setSent] = useState(false)
  // A message of this version reached the chat: the next one replaces it.
  const told = useRef(false)

  const onSend = async (text: string) => {
    const outcome = await send(host, billboard, text, told.current)
    if (outcome.sent) setSent(true)
    if (outcome.told) told.current = true
    return outcome
  }

  return (
    <Billboard
      billboard={billboard}
      onSend={onSend}
      sent={sent}
      layout={layoutOf(host)}
      onExpand={host.fullscreen}
      sessionLink={sessionLink}
    />
  )
}

const layoutOf = (host: Host) =>
  host.inFullscreen ? 'fullscreen' : host.fullscreen ? 'inline' : 'page'

/** The inline card's frame while the result comes: the label, the
 * paper and five empty rows, at the height of a first version's card (the
 * label on one line, which it takes once the fixed minimum IMDb rating is
 * off it), so the chat does not jump when it arrives (#277). */
function Loading() {
  return (
    <section aria-busy="true" className={`flex flex-col gap-md ${INLINE_CARD}`}>
      <p className="sr-only" role="status">
        {view.loading}
      </p>
      <div aria-hidden="true" className="flex flex-col items-start gap-xs">
        <div className="h-[40px] w-3/5 rounded-rail bg-case" />
        <div className="h-[29px] w-2/5 rounded-note bg-surface-2" />
      </div>
      <ul aria-hidden="true" className="flex flex-col gap-2xs">
        {[1, 2, 3, 4, 5].map((n) => (
          <li
            key={n}
            className="grid h-[38px] grid-cols-[8px_minmax(0,1fr)] gap-sm overflow-hidden rounded-rail bg-surface"
          >
            <span className="bg-case" />
          </li>
        ))}
      </ul>
      <div aria-hidden="true" className="h-touch rounded-pill bg-surface-2" />
    </section>
  )
}

/** A host without fullscreen: the whole Cartaz on its own ground, with
 * the inline card's rule and corners, from 560px; narrower, the cards take
 * the frame's width, as in the fullscreen's column, and sit on the frame's
 * floor, so the chips, the stars and the Já vi keep their one line (#277). */
const PAGE_GROUND =
  'min-[560px]:rounded-panel min-[560px]:border min-[560px]:border-rule min-[560px]:bg-ground min-[560px]:p-lg'

/** The view for the last tool result the host gave, or the wait for it. */
export function BillboardView({
  result,
  host,
}: {
  result: ToolResult | null
  host: Host
}) {
  if (result === null) return <Loading />
  const shown = billboardOf(result)
  return (
    <main className={layoutOf(host) === 'page' ? PAGE_GROUND : ''}>
      {'billboard' in shown ? (
        <>
          <h1 className="sr-only">
            {view.heading(shown.billboard.request.who)}
          </h1>
          <Cartaz
            key={`${shown.billboard.session}:${shown.billboard.version}`}
            billboard={shown.billboard}
            sessionLink={shown.sessionLink}
            host={host}
          />
        </>
      ) : (
        <section className={INLINE_CARD}>
          <h1 className="sr-only">{BILLBOARD.label}</h1>
          <Alert strip>{view.error(shown.error)}</Alert>
        </section>
      )}
    </main>
  )
}
