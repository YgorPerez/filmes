import type { Billboard as BillboardModel } from '@filmes/engine'
import { BILLBOARD } from './billboard.copy'
import { Icon } from './billboard-icons'
import { SendButton, Status } from './billboard-reply'
import { buttonVariants } from './kit/button-variants'
import { ShelfLabel } from './kit/shelf-label'
import { PriceSticker } from './kit/sticker'

// The Cartaz as Claude's inline card (DESIGN.md, Dentro do Claude): the
// conversation owns the scrolling and the card's height has a ceiling, so it
// shows four facts per film (number, title, year, duration), one line each,
// and Marcar, which opens the fullscreen, where the films are marked. Once
// something is marked there, the card says what in a line and Enviar
// comes beside Marcar; with nothing marked there is nothing to send. A
// Session that has its Feedback takes no marks: the one action opens the
// whole Cartaz.

/** Year and duration: the chips before the genres, the ones that are
 * numbers. */
const factsOf = (chips: readonly string[]) =>
  chips.filter((chip) => /^\d/u.test(chip)).join(' · ')

export function InlineBillboard({
  billboard,
  summary,
  message,
  onExpand,
  onSend,
}: {
  billboard: BillboardModel
  /** What was marked in the fullscreen; empty with nothing. */
  summary: string
  message: string
  onExpand: () => void
  onSend?: () => void
}) {
  const { view } = BILLBOARD
  const sending = billboard.open && summary !== ''
  return (
    <section
      aria-label={BILLBOARD.label}
      className="flex flex-col gap-md rounded-panel border border-rule bg-ground p-lg"
    >
      <ShelfLabel
        compact
        items={[billboard.request.who, ...billboard.request.parts]}
        note={billboard.request.speech}
      />
      <ol aria-label={view.list} className="flex flex-col gap-2xs">
        {billboard.films.map((film) => (
          <li
            key={film.id}
            className="grid grid-cols-[8px_26px_minmax(0,1fr)_auto] items-center gap-sm overflow-hidden rounded-rail bg-surface py-xs pr-md"
          >
            <span aria-hidden="true" className="self-stretch bg-case" />
            <PriceSticker compact>{film.position}</PriceSticker>
            <span className="truncate font-display text-row-title">
              {film.title}
            </span>
            <span className="text-meta text-ink-2 tabular-nums">
              {factsOf(film.chips)}
            </span>
          </li>
        ))}
      </ol>
      {sending && <p className="text-meta text-ink-2">{summary}</p>}
      <div className={`grid gap-sm ${sending ? 'grid-cols-2' : ''}`}>
        <button
          type="button"
          onClick={onExpand}
          className={buttonVariants({ variant: 'option', className: 'gap-xs' })}
        >
          <Icon name="expand" />
          {billboard.open ? view.mark : view.open}
        </button>
        {sending && <SendButton onSend={onSend} />}
      </div>
      <Status message={message} />
    </section>
  )
}
