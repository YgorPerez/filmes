import type { Billboard as BillboardModel } from '@filmes/engine'
import { BILLBOARD } from './billboard.copy'
import { Icon } from './billboard-icons'
import { Copy, SendButton, Status } from './billboard-reply'
import { buttonVariants } from './kit/button-variants'
import { ShelfLabel } from './kit/shelf-label'
import { PriceSticker } from './kit/sticker'

// The Cartaz as Claude's inline card (DESIGN.md, Dentro do Claude): the
// conversation owns the scrolling and the card's height has a ceiling, so it
// shows four facts per film (number, title, year, duration), one line each,
// and Marcar, which opens the fullscreen, where the films are marked. Once
// something is marked there, the card names it, a line per kind, with
// Limpar, and Enviar comes beside Marcar; with nothing marked there is
// nothing to send. Once sent, the card says what went and the one action
// is "Marcar de novo" (#277). After a regenerate, a line says what left
// and what came in, and each new film has the yellow dot. A Recomendação
// with no film says why and what to ask, with nothing to mark. A Session
// that has its Feedback takes no marks: the one action opens the whole
// Cartaz. The card has no floor of its own: it sits on the host's.

/** Year and duration: the chips before the genres, the ones that are
 * numbers. */
const factsOf = (chips: readonly string[]) =>
  chips.filter((chip) => /^\d/u.test(chip)).join(' · ')

/** The films, four facts each, a line per film. */
function InlineFilms({ films }: { films: BillboardModel['films'] }) {
  const { view } = BILLBOARD
  return (
    <ol aria-label={view.list} className="flex flex-col gap-2xs">
      {films.map((film) => (
        <li
          key={film.id}
          className="grid grid-cols-[8px_26px_minmax(0,1fr)_auto] items-center gap-sm overflow-hidden rounded-rail bg-surface py-xs pr-md"
        >
          {/* The spine keeps its edge on a dark host (#277). */}
          <span
            aria-hidden="true"
            className="self-stretch border border-case-edge bg-case"
          />
          <PriceSticker compact>{film.position}</PriceSticker>
          <span className="flex min-w-0 items-center gap-xs">
            <span className="truncate font-display text-row-title">
              {film.title}
            </span>
            {film.new && (
              <span className="size-2 shrink-0 rounded-round bg-sticker-yellow ring-1 ring-on-sticker/40">
                <span className="sr-only">{view.isNew}</span>
              </span>
            )}
          </span>
          <span className="text-meta text-ink-2 tabular-nums">
            {factsOf(film.chips)}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** What was marked, a line per kind, with Limpar until it went. */
function MarkedLines({
  marked,
  sent,
  onClear,
}: {
  marked: readonly string[]
  sent: boolean
  onClear?: () => void
}) {
  const { view, reply } = BILLBOARD
  return (
    <div className="flex flex-col gap-2xs text-meta">
      {sent && (
        <p className="font-display font-bold text-ink">{view.sentTitle}</p>
      )}
      <ul className="flex min-w-0 flex-col text-ink-2">
        {marked.map((line) => (
          <li key={line} className="truncate">
            {line}
          </li>
        ))}
      </ul>
      {!sent && onClear && (
        <button
          type="button"
          onClick={onClear}
          className={buttonVariants({
            variant: 'link',
            className: 'self-start',
          })}
        >
          {reply.clear}
        </button>
      )}
    </div>
  )
}

/** The words on the button that opens the fullscreen. */
function expandLabel(open: boolean, sent: boolean) {
  const { view } = BILLBOARD
  if (!open) return view.open
  return sent ? view.markAgain : view.mark
}

/** Marcar (or Abrir, or Marcar de novo), and Enviar beside it while
 * something marked waits. */
function InlineActions({
  open,
  sending,
  sent,
  onExpand,
  onSend,
}: {
  open: boolean
  sending: boolean
  sent: boolean
  onExpand: () => void
  onSend?: () => void
}) {
  const waiting = sending && !sent
  return (
    <div className={`grid gap-sm ${waiting ? 'grid-cols-2' : ''}`}>
      <button
        type="button"
        onClick={onExpand}
        className={buttonVariants({
          variant: 'option',
          className: 'gap-xs',
        })}
      >
        <Icon name="expand" />
        {expandLabel(open, sent)}
      </button>
      {waiting && <SendButton onSend={onSend} />}
    </div>
  )
}

/** The status line, and Copiar when Enviar could not go. */
function InlineStatus({
  message,
  copy,
  onMessage,
}: {
  message: string
  copy: string | null
  onMessage?: (message: string) => void
}) {
  if (!message && !copy) return null
  return (
    <div className="flex flex-wrap items-center gap-sm">
      <Status message={message} />
      {copy && onMessage && <Copy text={copy} onMessage={onMessage} />}
    </div>
  )
}

export function InlineBillboard({
  billboard,
  marked,
  sent = false,
  message,
  copy = null,
  onMessage,
  onExpand,
  onSend,
  onClear,
}: {
  billboard: BillboardModel
  /** What was marked in the fullscreen, a line per kind; none with
   * nothing. */
  marked: readonly string[]
  /** What is marked went already. */
  sent?: boolean
  message: string
  /** The text for Copiar, when Enviar could not go. */
  copy?: string | null
  onMessage?: (message: string) => void
  onExpand: () => void
  onSend?: () => void
  onClear?: () => void
}) {
  const { view } = BILLBOARD
  const empty = billboard.films.length === 0
  const sending = billboard.open && marked.length > 0
  const entered = billboard.films.filter((f) => f.new).map((f) => f.title)
  const changes =
    billboard.version > 1 ? view.changes(billboard.dropped, entered) : ''
  return (
    <section
      aria-label={BILLBOARD.label}
      className="flex flex-col gap-md rounded-panel border border-rule p-lg"
    >
      <ShelfLabel
        compact
        items={[billboard.request.who, ...billboard.request.parts]}
        note={billboard.request.speech}
      />
      {changes && <p className="text-meta text-ink-2">{changes}</p>}
      {empty ? (
        <p className="flex items-start gap-sm text-ink">
          {view.empty(billboard.request.parts)}
        </p>
      ) : (
        <InlineFilms films={billboard.films} />
      )}
      {sending && <MarkedLines marked={marked} sent={sent} onClear={onClear} />}
      {!empty && (
        <InlineActions
          open={billboard.open}
          sending={sending}
          sent={sent}
          onExpand={onExpand}
          onSend={onSend}
        />
      )}
      <InlineStatus message={message} copy={copy} onMessage={onMessage} />
    </section>
  )
}
