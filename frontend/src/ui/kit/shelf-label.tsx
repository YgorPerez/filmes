import { Fragment } from 'react'

// The shelf label, DESIGN.md's signature: the black rail with the light
// label inside, the night's request as one line of items split by coloured
// dots (orange, green, pink, repeating), and the Dono's words in marker on
// the yellow paper beside it. A screen reader gets the whole request from
// the `aria-label`; the items and the dots are hidden from it (The Shelf
// Label Rule). What she added later (an acrescentar of the Cartaz) goes on
// papers of its own under the first, tilted the other way (#272).

const DOTS = ['bg-sticker-orange', 'bg-sticker-green', 'bg-sticker-pink']

/** The night's request on the shelf label. `label` is what a screen reader
 * hears, with the words spelled out, when not the items in a row. */
export function ShelfLabel({
  items,
  label,
  note,
  added = [],
  compact = false,
  single = false,
  tag,
}: {
  items: readonly string[]
  label?: string
  /** What the Dono said, on the yellow paper; none without it. */
  note?: string | null
  /** What she added since, each on its own paper, after `note`. */
  added?: readonly string[]
  /** 15px on the label and 16px on the paper: Claude's inline card and
   * the top of its fullscreen. `narrow`: the full label, and the paper
   * compact on a phone, as the fullscreen's: the host without one (#351). */
  compact?: boolean | 'narrow'
  /** One line, cut with an ellipsis: the top of Claude's fullscreen on a
   * phone, where the label is all that stays fixed (#277). */
  single?: boolean
  /** A short word beside the label, in meta: the version ("v2"). */
  tag?: string
}) {
  const dot = single
    ? 'mx-sm mb-0.5 inline-block size-2 align-middle'
    : 'size-2 shrink-0'
  return (
    <div className="flex flex-col items-start gap-xs">
      <div className="flex max-w-full items-center gap-sm">
        <div
          role="img"
          aria-label={label ?? items.join(' · ')}
          className="min-w-0 rounded-rail bg-case p-1.25"
        >
          {/* `text-shelf`, not `text-shelf-label`: the colour of the same name
           * would paint the text in the label's own colour. */}
          <p
            className={`rounded-plate bg-shelf-label px-md pt-1.75 pb-xs font-display text-on-sticker uppercase ${
              compact === true ? 'text-shelf-compact' : 'text-shelf'
            } ${single ? 'truncate' : 'flex flex-wrap items-center gap-x-sm gap-y-2xs'}`}
          >
            {items.map((item, index) => {
              const mark = index > 0 && (
                <span
                  aria-hidden="true"
                  className={`${dot} rounded-round ${DOTS[(index - 1) % DOTS.length]}`}
                />
              )
              // On the wrapping label, each dot goes with the item after it,
              // so a line never ends on a dot.
              return single ? (
                <Fragment key={item}>
                  {mark}
                  <span aria-hidden="true">{item}</span>
                </Fragment>
              ) : (
                <span
                  key={item}
                  aria-hidden="true"
                  className="flex min-w-0 items-center gap-x-sm"
                >
                  {mark}
                  <span>{item}</span>
                </span>
              )
            })}
          </p>
        </div>
        {tag && (
          <span className="shrink-0 font-display text-meta text-ink-2">
            {tag}
          </span>
        )}
      </div>
      {note && <HandNote compact={compact}>{note}</HandNote>}
      {added.map((words) => (
        <HandNote key={words} compact={compact} tilt="right">
          {`+ ${words}`}
        </HandNote>
      ))}
    </div>
  )
}

/** The hand's size: 16px when compact, 18px when not, and 16px below
 * 560px only when narrow. */
const HAND = {
  compact: 'text-hand-compact',
  narrow: 'text-hand-compact min-[560px]:text-hand',
  full: 'text-hand',
} as const

/** The yellow paper with a short phrase in marker, stuck at -2° (The Hand
 * Is Short Rule: one sentence, never a number to check). It keeps 2px off
 * each side, so the turned corners of a paper as wide as its row stay
 * inside it, and a frame never scrolls sideways (#351). */
export function HandNote({
  children,
  compact = false,
  tilt = 'left',
}: {
  children: string
  /** `narrow`: compact on a phone only. */
  compact?: boolean | 'narrow'
  /** -2°, or 1.5° the other way for a paper added under another. */
  tilt?: 'left' | 'right'
}) {
  const hand =
    compact === 'narrow' ? HAND.narrow : compact ? HAND.compact : HAND.full
  return (
    <p
      className={`${tilt === 'left' ? '-rotate-2' : 'rotate-[1.5deg]'} mx-0.5 max-w-[calc(100%-4px)] rounded-note bg-sticker-yellow px-xl pt-1.25 pb-2xs font-hand text-on-sticker ${hand}`}
    >
      {children}
    </p>
  )
}
