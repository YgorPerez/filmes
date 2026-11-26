import type { Billboard as BillboardModel } from '@filmes/engine'
import {
  useEffect,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from 'react'
import { BillboardCard } from './billboard-card'
import { InlineBillboard } from './billboard-inline'
import {
  forgetMarks,
  hasMarks,
  marksOf,
  openStorage,
  parseMarks,
  replyText,
  saveMarks,
  storedMarks,
  type FilmMarks,
  type Marks,
} from './billboard-marks'
import { ReplyBox, SendButton, Status, summaryOf } from './billboard-reply'
import { Dropped, Legend } from './billboard-top'
import { BILLBOARD } from './billboard.copy'
import { ShelfLabel } from './kit/shelf-label'

// The Cartaz [billboard] of a Session (`cartaz/__init__.py`, `cartaz.js`):
// the request on the shelf label, the legend, what left the previous
// version, a card per film and, while the Session is open, the reply: the
// marks per film, the acrescentar and the Clima chips below the last film,
// Enviar and Copiar pro chat. It renders the engine's `billboardModel` and builds the text
// `answerBillboard` reads (`billboardText`).
//
// Nothing of the app here, so the MCP Apps view (#111) renders the same
// component: on the web Enviar posts the text to `action`; in the view,
// `onSend` gets it. The view picks the layout (DESIGN.md, Dentro do
// Claude): `inline` is the compact card in the conversation, `fullscreen`
// the one to mark films in, with the top and the foot fixed. The marks
// live here, so they survive the switch between the two.

type Layout = 'page' | 'inline' | 'fullscreen'

type Props = {
  billboard: BillboardModel
  /** Where Enviar posts the text (field `texto`): the web. */
  action?: string
  /** Gets the text instead of the post: the MCP Apps view. What its
   * promise gives is the status line. */
  onSend?: (text: string) => void | Promise<string>
  /** The marks of this version were sent: forget the kept ones. */
  sent?: boolean
  layout?: Layout
  /** Marcar on the inline card: asks the host for the fullscreen. */
  onExpand?: () => void
}

/** Another tab changed the storage. */
const subscribe = (changed: () => void) => {
  window.addEventListener('storage', changed)
  return () => window.removeEventListener('storage', changed)
}

/** The marks: what the server's page had (none, no storage); in the
 * browser, the kept ones until the Dono changes one; none once sent. */
function useMarks(billboard: BillboardModel, sent: boolean) {
  const kept = useSyncExternalStore(
    subscribe,
    () => (sent ? null : storedMarks(billboard)),
    () => null,
  )
  const canKeep = useSyncExternalStore(
    subscribe,
    () => openStorage() !== null,
    () => false,
  )
  const [edited, setEdited] = useState<Marks | null>(null)
  const marks = edited ?? parseMarks(kept, billboard)

  useEffect(() => {
    if (sent) forgetMarks(openStorage(), billboard)
  }, [billboard, sent])

  const change = (next: Marks) => {
    setEdited(next)
    saveMarks(openStorage(), billboard, next)
  }
  return { marks, change, canKeep }
}

function Request({
  billboard,
  compact = false,
}: {
  billboard: BillboardModel
  compact?: boolean
}) {
  return (
    <ShelfLabel
      compact={compact}
      items={[billboard.request.who, ...billboard.request.parts]}
      note={billboard.request.speech}
    />
  )
}

export function Billboard({
  billboard,
  action,
  onSend,
  sent = false,
  layout = 'page',
  onExpand,
}: Props) {
  const { marks, change, canKeep } = useMarks(billboard, sent)
  const [message, setMessage] = useState('')

  const changeFilm = (id: string) => (film: FilmMarks) =>
    change({ ...marks, films: { ...marks.films, [id]: film } })

  // The web posts the form; nothing marked stays here.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    if (onSend === undefined && hasMarks(replyText(billboard, marks))) return
    event.preventDefault()
    if (onSend === undefined) setMessage(BILLBOARD.reply.nothing)
  }
  // The view hands the text over instead.
  const send = (handOver: NonNullable<Props['onSend']>) => () => {
    const text = replyText(billboard, marks)
    if (!hasMarks(text)) {
      setMessage(BILLBOARD.reply.nothing)
      return
    }
    const status = handOver(text)
    if (status) {
      setMessage(BILLBOARD.view.sending)
      void status.then(setMessage)
    }
  }
  const onSendClick = onSend && send(onSend)
  const empty = billboard.films.length === 0
  const replying = billboard.open && !empty

  if (layout === 'inline' && onExpand)
    return (
      <InlineBillboard
        billboard={billboard}
        message={message}
        onExpand={onExpand}
        onSend={onSendClick}
      />
    )

  const cards = billboard.films.map((film, i) => (
    <BillboardCard
      key={film.id}
      film={film}
      people={billboard.attendees}
      first={i === 0}
      marks={billboard.open ? marksOf(marks, film.id) : undefined}
      onChange={billboard.open ? changeFilm(film.id) : undefined}
    />
  ))
  const fullscreen = layout === 'fullscreen'
  const shelf = (
    <>
      {empty && <p className="text-ink-2">{BILLBOARD.empty}</p>}
      <Dropped billboard={billboard} />
      {cards}
      {replying && (
        <ReplyBox
          billboard={billboard}
          marks={marks}
          kept={canKeep}
          message={message}
          onMessage={setMessage}
          onAddition={(addition) => change({ ...marks, addition })}
          onMoods={(moods) => change({ ...marks, moods })}
          send={fullscreen ? undefined : { onSend: onSendClick }}
        />
      )}
    </>
  )

  const body = fullscreen ? (
    <Fullscreen
      top={
        <>
          <Request billboard={billboard} compact />
          <Legend billboard={billboard} />
        </>
      }
      foot={
        replying && (
          <>
            <div className="flex items-center justify-between gap-md">
              <p className="min-w-0 text-meta text-ink-2">
                {summaryOf(billboard, marks)}
              </p>
              <SendButton onSend={onSendClick} className="shrink-0" />
            </div>
            <Status message={message} />
          </>
        )
      }
    >
      {shelf}
    </Fullscreen>
  ) : (
    <div className="flex flex-col gap-2xl">
      <Request billboard={billboard} />
      <Legend billboard={billboard} />
      {shelf}
    </div>
  )

  return replying ? (
    <form
      method="post"
      action={action}
      onSubmit={submit}
      aria-label={BILLBOARD.label}
    >
      {body}
    </form>
  ) : (
    body
  )
}

/** Claude's fullscreen: the request and the legend fixed on top, the
 * shelf scrolling, the summary and Enviar fixed at the foot, above the
 * host's message box (its safe area). */
function Fullscreen({
  top,
  foot,
  children,
}: {
  top: ReactNode
  foot: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex flex-col gap-sm border-b border-rule bg-ground px-2xl py-md">
        {top}
      </header>
      <div className="flex flex-1 flex-col gap-2xl p-2xl">{children}</div>
      {foot && (
        <footer className="sticky bottom-0 z-10 flex flex-col gap-xs border-t border-rule bg-surface px-2xl pt-md pb-[max(10px,env(safe-area-inset-bottom))]">
          {foot}
        </footer>
      )}
    </div>
  )
}
