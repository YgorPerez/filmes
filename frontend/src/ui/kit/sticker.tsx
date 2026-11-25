import type { ReactNode } from 'react'

// The stickers stuck on a tape (DESIGN.md, Adesivos de estado): flat colour,
// `on-sticker` text in both themes, turned by at most 12°. The caller places
// them (`absolute` and its offsets); the sticker only says what it is.

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
      className={`inline-grid shrink-0 -rotate-8 place-items-center rounded-round bg-sticker-orange font-display text-price text-on-sticker tabular-nums ring-2 ring-surface ${
        compact ? 'size-[26px] text-[14px]' : 'size-[34px]'
      } ${className}`}
    >
      {children}
    </span>
  )
}

const KINDS = {
  /** Yellow NOVO, on whoever came in on regenerating. */
  new: 'rotate-9 bg-sticker-yellow px-sm pt-xs pb-[5px] text-sticker',
  /** Pink TROCAR, slapped on the cover. */
  swap: '-rotate-9 bg-sticker-pink px-md pt-[7px] pb-xs text-sticker text-[15px]',
  /** JÁ VI of every Presente: no sticker colour, a 2px ink outline. */
  seen: '-rotate-9 border-2 border-ink bg-surface px-md pt-[5px] pb-2xs text-sticker text-[15px] text-ink',
} as const

/** A state sticker: NOVO, TROCAR or JÁ VI. */
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
      className={`inline-block rounded-cover font-display text-on-sticker uppercase ${KINDS[kind]} ${className}`}
    >
      {children}
    </span>
  )
}
