import type { BillboardPerson } from '@filmes/engine'
import { useId, type ReactNode } from 'react'
import type { FilmSheet as Sheet } from '#/platform/session-votes'
import { BILLBOARD } from './billboard.copy'
import {
  EvidenceLine,
  LINK_CHIP,
  LINK_CHIP_FACE,
  Predicted,
} from './billboard-card'
import { buttonVariants } from './kit/button-variants'
import { Chip } from './kit/chip'
import { Icon } from './kit/icon'
import { FilmCover } from './session-link'
import { SHEET } from './film-sheet.copy'

// A film's full sheet (#377): what the Cartaz's card says of it, over the
// page. The synopsis, the chips, the IMDb with its votes and the trailer
// (links, never a player), the awards and the critics, and "Por que" with
// the Nota prevista and the Evidence of whoever looks only: the server
// sends a Presente her own and the Dono everyone's. The swipe's card opens
// it, and so does the ranking step; what to do with the film (`children`)
// goes at the bottom. A modal dialog where the browser has one: Esc and
// Fechar close it.

/** The film as the sheet names it: the link's card has the poster and the
 * titles. */
type Named = {
  title: string
  originalTitle: string | null
  poster: string | null
}

export function FilmSheet({
  film,
  sheet,
  people,
  onClose,
  children,
}: {
  film: Named
  sheet: Sheet | null
  /** Whom the lines name; "Você" is whoever looks. */
  people: readonly BillboardPerson[]
  onClose: () => void
  children?: ReactNode
}) {
  const heading = useId()
  return (
    <dialog
      ref={(dialog) => {
        if (!dialog || dialog.open) return
        if (typeof dialog.showModal === 'function') dialog.showModal()
        else dialog.open = true
      }}
      aria-labelledby={heading}
      onClose={onClose}
      className="m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto overscroll-contain bg-ground p-0 text-ink backdrop:bg-case/80"
    >
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-lg px-2xl pt-lg pb-3xl max-[480px]:px-lg">
        <button
          type="button"
          onClick={onClose}
          className={buttonVariants({
            variant: 'link',
            className: 'min-h-touch self-end',
          })}
        >
          <Icon name="close" className="size-[18px]" />
          {SHEET.close}
        </button>
        <div className="grid grid-cols-[112px_1fr] gap-xl min-[560px]:grid-cols-[160px_1fr]">
          <FilmCover
            poster={film.poster}
            title={film.title}
            eager
            className="w-full self-start"
          />
          <div className="flex min-w-0 flex-col gap-sm">
            <h2 id={heading} className="font-display text-title text-balance">
              {film.title}
            </h2>
            {film.originalTitle && (
              <p className="text-meta text-ink-2">{film.originalTitle}</p>
            )}
            {sheet && <SheetChips sheet={sheet} />}
          </div>
        </div>
        {sheet?.synopsis && (
          <p className="max-w-[60ch] text-synopsis text-pretty">
            {sheet.synopsis}
          </p>
        )}
        {sheet && (sheet.awards || sheet.critics) && (
          <ul className="text-meta text-ink-2">
            {[...(sheet.awards ?? []), ...(sheet.critics ?? [])].map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
        {sheet && <SheetWhy sheet={sheet} people={people} />}
        {children}
      </div>
    </dialog>
  )
}

/** The chips, then the IMDb with its votes and the trailer, as the
 * Cartaz's card header has them. */
function SheetChips({ sheet }: { sheet: Sheet }) {
  return (
    <div className="flex flex-wrap items-center gap-x-xs">
      {sheet.chips.map((chip) => (
        <Chip key={chip}>{chip}</Chip>
      ))}
      <a
        href={sheet.imdbUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={LINK_CHIP}
      >
        <span className={LINK_CHIP_FACE}>
          {BILLBOARD.card.imdb(sheet.imdbRatingText, sheet.votesText)}
        </span>
      </a>
      {sheet.trailer && (
        <a
          href={sheet.trailer}
          target="_blank"
          rel="noopener noreferrer"
          className={LINK_CHIP}
        >
          <span className={LINK_CHIP_FACE}>{BILLBOARD.card.trailer}</span>
        </a>
      )}
    </div>
  )
}

/** "Por que": the Nota prevista, the lines and who has no Fato, for the
 * people the server sent. Nothing to say, no block. */
function SheetWhy({
  sheet,
  people,
}: {
  sheet: Sheet
  people: readonly BillboardPerson[]
}) {
  const known = new Map(people.map((p) => [p.slug, p]))
  const without = sheet.withoutFact.flatMap((slug) => known.get(slug) ?? [])
  if (
    sheet.lines.length === 0 &&
    without.length === 0 &&
    sheet.predictedRatings.length === 0 &&
    !sheet.cautiousBetReason
  )
    return null
  return (
    <div className="flex flex-col gap-sm border-t border-dashed border-rule pt-lg">
      <p className="font-display text-label text-ink-2 uppercase">
        {people.length === 1 ? SHEET.whyYou : BILLBOARD.card.why}
      </p>
      <Predicted ratings={sheet.predictedRatings} people={people} />
      <ul aria-label={SHEET.why} className="flex flex-col gap-2.25">
        {sheet.cautiousBetReason && (
          <li className="text-evidence text-ink-2">
            {sheet.cautiousBetReason}
          </li>
        )}
        {sheet.lines.map((line) => (
          <EvidenceLine
            key={`${line.people.join(' ')}:${line.text}`}
            line={line}
            people={known}
          />
        ))}
        {without.length > 0 && (
          <li className="text-evidence text-ink-2">
            {BILLBOARD.card.withoutFact(BILLBOARD.names(without))}
          </li>
        )}
      </ul>
    </div>
  )
}
