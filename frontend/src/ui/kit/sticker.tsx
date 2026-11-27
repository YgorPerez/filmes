import type { ReactNode } from 'react'

// The stickers stuck on a tape (DESIGN.md, Adesivos de estado): flat colour,
// `on-sticker` text in both themes, turned by at most 12°. The caller places
// them (`absolute` and its offsets); the sticker only says what it is.
// It comes in stuck: from 1.15× and transparent to 1× in 160ms, already
// at its final turn, and not at all under reduced motion (DESIGN.md,
// Motion).

/** The orange price sticker with the film's (or the step's) number:
 * `size` 34px on the case, 26px in the compact list. */
export function PriceSticker({
  children,
  compact = false,
  className = '',
}: {
  children: ReactNode
  compact?: boolean
  className?: string
}) {
  return (
    <span
      className={`inline-grid shrink-0 -rotate-8 place-items-center rounded-round bg-sticker-orange font-display text-on-sticker tabular-nums ring-2 ring-surface ${
        compact ? 'size-[26px] text-price-compact' : 'size-[34px] text-price'
      } ${className}`}
    >
      {children}
    </span>
  )
}

/** TROCAR and JÁ VI: the sticker type at 15px. */
const BIG = 'text-[15px]/none font-extrabold tracking-[0.06em]'

const KINDS = {
  /** Yellow NOVO, on whoever came in on regenerating. */
  new: 'rotate-9 bg-sticker-yellow px-sm pt-xs pb-[5px] text-sticker text-on-sticker',
  /** Pink TROCAR, slapped on the cover. */
  swap: `-rotate-9 bg-sticker-pink px-md pt-[7px] pb-xs text-on-sticker ${BIG}`,
  /** Green SIM, on the Link da Sessão's card dragged to the right (#275);
   * the card dragged to the left gets the pink of TROCAR, since a não is
   * one. */
  yes: `rotate-9 bg-sticker-green px-md pt-[7px] pb-xs text-on-sticker ${BIG}`,
  /** JÁ VI of every Presente: no sticker colour, a 2px ink outline. */
  seen: `-rotate-9 border-2 border-ink bg-surface px-md pt-[5px] pb-2xs text-ink ${BIG}`,
} as const

/** A state sticker: NOVO, TROCAR, SIM or JÁ VI. */
export function Sticker({
  kind,
  children,
  className = '',
}: {
  kind: keyof typeof KINDS
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-block rounded-cover font-display uppercase motion-safe:animate-stick ${KINDS[kind]} ${className}`}
    >
      {children}
    </span>
  )
}
