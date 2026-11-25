import { Fragment } from 'react'

// The shelf label, DESIGN.md's signature: the black rail with the light
// label inside, the night's request as one line of items split by coloured
// dots (orange, green, pink, repeating), and the Dono's words in marker on
// the yellow paper beside it. A screen reader gets the whole request from
// the `aria-label`; the items and the dots are hidden from it (The Shelf
// Label Rule).

const DOTS = ['bg-sticker-orange', 'bg-sticker-green', 'bg-sticker-pink']

/** The night's request on the shelf label. `label` is what a screen reader
 * hears, with the words spelled out, when not the items in a row. */
export function ShelfLabel({
  items,
  label,
  note,
  compact = false,
}: {
  items: readonly string[]
  label?: string
  /** What the Dono said, on the yellow paper; none without it. */
  note?: string | null
  /** 15px on the label and 16px on the paper: Claude's inline card and
   * the top of its fullscreen. */
  compact?: boolean
}) {
  return (
    <div className="flex flex-col items-start gap-xs">
      <div
        role="img"
        aria-label={label ?? items.join(' · ')}
        className="rounded-rail bg-case p-[5px]"
      >
        {/* Not `text-shelf-label`: the colour of the same name would paint
         * the text in the label's own colour. */}
        <p
          className={`flex flex-wrap items-center gap-x-sm gap-y-2xs rounded-plate bg-shelf-label px-md pt-[7px] pb-xs font-display leading-[1.15] font-extrabold tracking-[0.01em] text-on-sticker uppercase ${
            compact ? 'text-[15px]' : 'text-[17px]'
          }`}
        >
          {items.map((item, index) => (
            <Fragment key={item}>
              {index > 0 && (
                <span
                  aria-hidden="true"
                  className={`size-2 shrink-0 rounded-round ${DOTS[(index - 1) % DOTS.length]}`}
                />
              )}
              <span aria-hidden="true">{item}</span>
            </Fragment>
          ))}
        </p>
      </div>
      {note && <HandNote compact={compact}>{note}</HandNote>}
    </div>
  )
}

/** The yellow paper with a short phrase in marker, stuck at -2° (The Hand
 * Is Short Rule: one sentence, never a number to check). */
function HandNote({
  children,
  compact,
}: {
  children: string
  compact: boolean
}) {
  return (
    <p
      className={`-rotate-2 rounded-note bg-sticker-yellow px-xl pt-[5px] pb-2xs font-hand text-on-sticker ${compact ? 'text-[16px]/[1.2]' : 'text-hand'}`}
    >
      {children}
    </p>
  )
}
