import { type PointerEvent, useId, useRef } from 'react'

// A Presente's colour (DESIGN.md, Avatares; The One Color Per Person Rule):
// one per Presente by her order in the Session, the same in the dot of her
// Nota prevista, her avatar in the legend and in the marks, always with her
// initial or name beside it. Hollow (a ring in her colour) is the Presente
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

/** Where the browser cannot anchor the popover to its dot, it would open at
 * the page's top left: there it goes under the dot, from where the dot is
 * on screen. */
const underDot = (popover: HTMLElement, dot: HTMLElement) => {
  if (CSS.supports('anchor-name', '--dot')) return
  const { bottom, left } = dot.getBoundingClientRect()
  popover.style.setProperty('position-area', 'none')
  popover.style.top = `${bottom}px`
  popover.style.left = `${left}px`
}

/** Her 12px dot, with her name and her Nota prevista beside it when she
 * has one ("Iara 8,3", on the line under "Por que", #326). The dot alone is
 * only a picture. With a number, it is a button whose `label` a screen
 * reader hears and whose `hint` ("pela nota de 4 pessoas de gosto
 * parecido") opens in a native popover under it, running right, by a tap
 * or a click (a tap outside or Esc closes it) and by a mouse over it. The
 * text stays small, and an invisible 44px box centred on it takes the tap
 * (#268).
 * Without CSS anchor positioning (Firefox, Safari before 26) the popover
 * is placed under the dot by hand as it opens (`underDot`). */
export function PersonDot({
  person,
  hollow = false,
  rating,
}: {
  person: Person
  hollow?: boolean
  rating?: { text: string; hint: string; label: string; name?: string }
}) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
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
        ref={button}
        type="button"
        popoverTarget={id}
        popoverTargetAction="show"
        aria-label={rating.label}
        onPointerEnter={hover(true)}
        onPointerLeave={hover(false)}
        style={{ anchorName: anchor }}
        className="relative inline-flex cursor-pointer items-center gap-xs text-inherit tabular-nums underline decoration-dotted decoration-1 underline-offset-3 after:absolute after:top-1/2 after:left-1/2 after:h-touch after:w-[max(100%,44px)] after:-translate-1/2 after:content-['']"
      >
        {dot}
        <span aria-hidden="true">
          {rating.name && `${rating.name} `}
          {rating.text}
        </span>
      </button>
      <span
        id={id}
        ref={(popover) => {
          if (!popover) return
          const place = () => {
            if (button.current) underDot(popover, button.current)
          }
          popover.addEventListener('beforetoggle', place)
          return () => popover.removeEventListener('beforetoggle', place)
        }}
        popover="auto"
        aria-hidden="true"
        style={{ positionAnchor: anchor }}
        className="inset-auto m-0 mt-1 w-max max-w-[calc(100vw-32px)] rounded-field border border-rule bg-surface px-sm py-xs text-meta text-ink [position-area:bottom_span-right] [position-try-fallbacks:flip-block]"
      >
        {rating.hint}
      </span>
    </>
  )
}
