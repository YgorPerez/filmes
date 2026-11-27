import { type PointerEvent, type ReactNode, useId, useRef } from 'react'

// A word with a hint under it (DESIGN.md, Nota prevista): the word is a
// button whose name is `label`, and a native popover under it, running
// right, says `hint`. A tap or a click opens it (a tap outside or Esc
// closes it), and so does a mouse over it. The popover repeats the hint to
// the eye only: a screen reader hears it once, in the button's name. An
// invisible 44px box centred on the word takes the tap (#268).
// Without CSS anchor positioning (Firefox, Safari before 26) the popover
// is placed under the word by hand as it opens (`under`).

/** Where the browser cannot anchor the popover to its word, it would open
 * at the page's top left: there it goes under the word, from where the
 * word is on screen. */
const under = (popover: HTMLElement, word: HTMLElement) => {
  if (CSS.supports('anchor-name', '--hint')) return
  const { bottom, left } = word.getBoundingClientRect()
  popover.style.setProperty('position-area', 'none')
  popover.style.top = `${bottom}px`
  popover.style.left = `${left}px`
}

export function Hint({
  label,
  hint,
  children,
}: {
  /** The button's name: the word and the hint, for a screen reader. */
  label: string
  hint: string
  children: ReactNode
}) {
  const id = useId()
  const button = useRef<HTMLButtonElement>(null)
  const anchor = `--hint-${id.replaceAll(/[^\w-]/g, '')}`
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
        aria-label={label}
        onPointerEnter={hover(true)}
        onPointerLeave={hover(false)}
        style={{ anchorName: anchor }}
        className="relative cursor-pointer underline decoration-dotted underline-offset-2 after:absolute after:top-1/2 after:left-1/2 after:h-touch after:w-[max(100%,44px)] after:-translate-1/2 after:content-['']"
      >
        <span aria-hidden="true">{children}</span>
      </button>
      <span
        id={id}
        ref={(popover) => {
          if (!popover) return
          const place = () => {
            if (button.current) under(popover, button.current)
          }
          popover.addEventListener('beforetoggle', place)
          return () => popover.removeEventListener('beforetoggle', place)
        }}
        popover="auto"
        aria-hidden="true"
        style={{ positionAnchor: anchor }}
        className="inset-auto m-0 mt-1 w-max max-w-[calc(100vw-32px)] rounded-field border border-rule bg-surface px-sm py-xs text-meta text-ink [position-area:bottom_span-right] [position-try-fallbacks:flip-block]"
      >
        {hint}
      </span>
    </>
  )
}
