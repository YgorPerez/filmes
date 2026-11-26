import { type PointerEvent, useId } from 'react'

// A Presente's colour (DESIGN.md, Avatares; The One Color Per Person Rule):
// one per Presente by her order in the Session, the same in the dot under
// the cover, her avatar in the legend and in the marks, always with her
// initial or name beside it (or, on the dot, in its hint). Hollow (a ring in her colour) is the Presente
// without a Fato.

/** What a colour needs to know of a Presente. */
interface Person {
  /** Her order in the Session, from 1. */
  readonly color: number
  readonly initial: string
  readonly name: string
}

// One class list per person colour, written out so Tailwind finds them.
const FILLED = [
  'bg-person-1 border-person-1',
  'bg-person-2 border-person-2',
  'bg-person-3 border-person-3',
  'bg-person-4 border-person-4',
  'bg-person-5 border-person-5',
  'bg-person-6 border-person-6',
]
const HOLLOW = [
  'border-person-1 text-person-1',
  'border-person-2 text-person-2',
  'border-person-3 text-person-3',
  'border-person-4 text-person-4',
  'border-person-5 text-person-5',
  'border-person-6 text-person-6',
]
const colorOf = (person: Person, hollow: boolean) =>
  (hollow ? HOLLOW : FILLED)[(person.color - 1) % FILLED.length]

/** A Presente's initial in her colour, 24px; hollow when she has no Fato. */
export function Avatar({
  person,
  hollow = false,
}: {
  person: Person
  hollow?: boolean
}) {
  return (
    <span
      className={`inline-flex size-6 shrink-0 items-center justify-center rounded-round border-2 font-display text-avatar ${
        hollow ? 'bg-transparent' : 'text-on-person'
      } ${colorOf(person, hollow)}`}
    >
      {person.initial}
    </span>
  )
}

/** Her 12px dot on the case, under the cover, with her Nota prevista
 * beside it when she has one ("8,3"). The dot alone is only a picture: the
 * card says in its text who has no Fato ("Fulano: sem fato sobre este
 * filme"). With a number, the dot is a button whose `hint` says whose it is
 * and how many neighbours back it: a native popover under it, running right
 * from the dot (the case is on the card's left), opened by a
 * tap or a click (a tap outside or Esc closes it) and by a mouse over it. */
export function PersonDot({
  person,
  hollow = false,
  rating,
}: {
  person: Person
  hollow?: boolean
  rating?: { text: string; hint: string }
}) {
  const id = useId()
  const dot = (
    <span
      aria-hidden="true"
      className={`size-3 shrink-0 rounded-round border-2 ${hollow ? 'bg-transparent' : ''} ${colorOf(person, hollow)}`}
    />
  )
  if (!rating) return dot
  const anchor = `--dot-${id.replaceAll(/[^\w-]/g, '')}`
  const hover = (open: boolean) => (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse')
      event.currentTarget.ownerDocument.getElementById(id)?.togglePopover(open)
  }
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        popoverTargetAction="show"
        aria-label={rating.hint}
        onPointerEnter={hover(true)}
        onPointerLeave={hover(false)}
        style={{ anchorName: anchor }}
        className="relative inline-flex cursor-pointer items-center gap-0.5 font-display text-avatar text-case-ink tabular-nums after:absolute after:-inset-x-0.5 after:-inset-y-2 after:content-['']"
      >
        {dot}
        <span aria-hidden="true">{rating.text}</span>
      </button>
      <span
        id={id}
        popover="auto"
        style={{ positionAnchor: anchor }}
        className="inset-auto m-0 mt-1 w-max max-w-[calc(100vw-32px)] rounded-field border border-rule bg-surface px-sm py-xs text-meta text-ink [position-area:bottom_span-right] [position-try-fallbacks:flip-block]"
      >
        {rating.hint}
      </span>
    </>
  )
}
