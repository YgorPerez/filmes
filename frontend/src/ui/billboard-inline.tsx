import type { Billboard as BillboardModel } from '@filmes/engine'
import { BILLBOARD } from './billboard.copy'
import { ChosenReactions } from './billboard-chosen'
import { Icon } from './billboard-icons'
import { Copy, SendButton, Status } from './billboard-reply'
import { askedParts } from './billboard-request'
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
// is "Marcar de novo", quiet, since the new list comes in the chat below
// (#277). A marked film keeps its place with a small TROCAR or JÁ VI tag
// on its row until the list is redone. After a regenerate, a line says
// what left and what came in (the fullscreen says the same line); no film
// carries a "novo" mark (#326). A Recomendação with no film says why and
// what to ask, with nothing to mark. A Session that has its Feedback takes
// no marks: it says so, with the Filme escolhido and what each Presente
// was predicted to give and gave, and the one action opens the whole
// Cartaz. The card has no floor of its own: it sits on the host's.

/** What a row may say of its film: Trocar, Já vi, or the Filme
 * escolhido of a closed Session. */
export type RowTag = 'swap' | 'seen' | 'chosen'

const TAG: Record<RowTag, string> = {
  swap: 'bg-sticker-pink text-on-sticker',
  seen: 'border-(length:--border-width-stroke) border-ink text-ink',
  chosen: 'bg-sticker-green text-on-sticker',
}

/** A row's tag: the sticker's colours and words, small. */
function Tag({ kind }: { kind: RowTag }) {
  return (
    <span
      className={`shrink-0 rounded-cover px-xs pt-0.75 pb-0.5 font-display text-sticker uppercase ${TAG[kind]}`}
    >
      {BILLBOARD.view.tag[kind]}
    </span>
  )
}

/** What changed from the previous version, in one line: "Saiu: Cais 2
 * (trocado) · entrou: Fronteira". The inline card and the fullscreen say
 * it the same way (#277). Nothing on a first version or once closed. */
export function Changes({ billboard }: { billboard: BillboardModel }) {
  if (!billboard.open || billboard.version < 2) return null
  const entered = billboard.films.filter((f) => f.new).map((f) => f.title)
  const changes = BILLBOARD.view.changes(billboard.dropped, entered)
  return changes ? (
    <p className="text-meta text-pretty text-ink-2">{changes}</p>
  ) : null
}

/** Year and duration: the chips before the genres, the ones that are
 * numbers. */
const factsOf = (chips: readonly string[]) =>
  chips.filter((chip) => /^\d/u.test(chip)).join(' · ')

/** The films, four facts each, a line per film, with its tags. */
function InlineFilms({
  films,
  tags,
}: {
  films: BillboardModel['films']
  tags: Readonly<Record<string, readonly RowTag[]>>
}) {
  const { view } = BILLBOARD
  const chosen = new Set(
    Object.keys(tags).filter((id) => tags[id]?.includes('chosen')),
  )
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
            {/* The Filme escolhido's title takes two lines before its tag
                cuts it (#277). */}
            <span
              className={`font-display text-row-title ${chosen.has(film.id) ? 'line-clamp-2' : 'truncate'}`}
            >
              {film.title}
            </span>
            {(tags[film.id] ?? []).map((kind) => (
              <Tag key={kind} kind={kind} />
            ))}
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
          // Once sent, the new list comes in the chat: going back to this
          // one is the quiet way (#277).
          variant: sent ? 'link' : 'option',
          className: sent ? 'gap-xs justify-self-start' : 'gap-xs',
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

/** A closed Session: it says so, then the Filme escolhido and each
 * Presente's line ("Bruno: previsto 8,3 · deu 8 de 10"), when there was
 * a Feedback with one (#277). */
function Closed({ billboard }: { billboard: BillboardModel }) {
  const { view } = BILLBOARD
  const card = billboard.films.find((f) => f.reactions !== undefined)
  const chosen = card ?? billboard.chosen
  return (
    <div className="flex flex-col gap-xs">
      <p className="text-meta text-ink-2">
        {view.closed}
        {chosen && (
          <>
            {' · '}
            {view.chosen}{' '}
            <strong className="font-display font-bold text-ink">
              {chosen.title}
            </strong>
          </>
        )}
      </p>
      {chosen?.reactions && (
        <ChosenReactions
          bare
          reactions={chosen.reactions}
          people={billboard.attendees}
        />
      )}
    </div>
  )
}

/** The tags of each film's row: the marks, or the Filme escolhido. */
const rowTags = (
  billboard: BillboardModel,
  tags: Readonly<Record<string, readonly RowTag[]>>,
) =>
  billboard.open
    ? tags
    : Object.fromEntries(
        billboard.films
          .filter((f) => f.reactions !== undefined)
          .map((f) => [f.id, ['chosen'] as const]),
      )

export function InlineBillboard({
  billboard,
  marked,
  tags = {},
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
  /** Each marked film's tags, by id. */
  tags?: Readonly<Record<string, readonly RowTag[]>>
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
  return (
    <section
      aria-label={BILLBOARD.label}
      className="flex flex-col gap-md rounded-panel border border-rule p-lg"
    >
      <ShelfLabel
        compact
        items={[billboard.request.who, ...askedParts(billboard.request.parts)]}
        note={billboard.request.speech}
      />
      {billboard.open ? (
        <Changes billboard={billboard} />
      ) : (
        <Closed billboard={billboard} />
      )}
      {empty ? (
        <p className="flex items-start gap-sm text-ink">
          {view.empty(billboard.request.parts)}
        </p>
      ) : (
        <InlineFilms films={billboard.films} tags={rowTags(billboard, tags)} />
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
