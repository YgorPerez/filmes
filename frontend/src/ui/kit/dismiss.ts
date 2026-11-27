// A `<details>` that opens over the page (the Cartaz's ⋯ menu and "?"
// legend) closes by itself like a menu (#272): a tap or a click outside it,
// or Esc, closes it, and Esc gives the focus back to its summary. Opening
// one closes the other: they share a `name` (`HEAD_POPOVERS`), the HTML
// exclusive accordion. A ref callback: React calls the cleanup it returns.

/** The `name` the Cartaz head's popovers share, so one opens at a time. */
export const HEAD_POPOVERS = 'cartaz-head'

export const closeOnOutside = (details: HTMLDetailsElement | null) => {
  if (!details) return
  const doc = details.ownerDocument
  const down = (event: PointerEvent) => {
    if (details.open && !details.contains(event.target as Node))
      details.open = false
  }
  const key = (event: KeyboardEvent) => {
    if (!details.open || event.key !== 'Escape') return
    const focused = details.contains(doc.activeElement)
    details.open = false
    if (focused) details.querySelector('summary')?.focus()
  }
  // The browser closes the others by their `name`; this does it where the
  // exclusive accordion is missing (Firefox before 130).
  const toggle = () => {
    if (!details.open || details.name === '') return
    for (const other of doc.querySelectorAll<HTMLDetailsElement>(
      `details[name="${details.name}"]`,
    ))
      if (other !== details) other.open = false
  }
  doc.addEventListener('pointerdown', down)
  doc.addEventListener('keydown', key)
  details.addEventListener('toggle', toggle)
  return () => {
    doc.removeEventListener('pointerdown', down)
    doc.removeEventListener('keydown', key)
    details.removeEventListener('toggle', toggle)
  }
}
