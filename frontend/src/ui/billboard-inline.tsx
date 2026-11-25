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
// and two actions: Marcar opens the fullscreen, where the films are marked,
// and Enviar sends what was marked there. A Session that has its
// Feedback takes no marks: the one action opens the whole Cartaz.

/** Year and duration: the chips before the genres, the ones that are
 * numbers. */
const factsOf = (chips: readonly string[]) =>
  chips.filter((chip) => /^\d/u.test(chip)).join(' · ')

export function InlineBillboard({
  billboard,
  message,
  onExpand,
  onSend,
}: {
  billboard: BillboardModel
  message: string
  onExpand: () => void
  onSend?: () => void
}) {
  const { view } = BILLBOARD
  return (
    <section
      aria-label={BILLBOARD.label}
      className="flex flex-col gap-md rounded-panel border border-rule bg-ground p-lg"
    >
      <p className="font-display text-[11px] leading-none font-bold tracking-[0.06em] text-ink-2 uppercase">
        {view.tag}
      </p>
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
            <span className="truncate font-display text-[15px] font-bold">
              {film.title}
            </span>
            <span className="text-meta text-ink-2 tabular-nums">
              {factsOf(film.chips)}
            </span>
          </li>
        ))}
      </ol>
      <div className={`grid gap-sm ${billboard.open ? 'grid-cols-2' : ''}`}>
        <button
          type="button"
          onClick={onExpand}
          className={buttonVariants({ variant: 'option', className: 'gap-xs' })}
        >
          <Icon name="expand" />
          {billboard.open ? view.mark : view.open}
        </button>
        {billboard.open && <SendButton onSend={onSend} />}
      </div>
      <Status message={message} />
    </section>
  )
}
