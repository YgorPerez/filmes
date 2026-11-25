// The drawn icons (DESIGN.md, Opções; Prateleira de navegação): authored
// SVG on a 24px grid, a 2px round stroke in `currentColor`, never a
// glyph or an emoji. They are decoration beside a word, so a screen reader
// skips them.

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.4,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/** The 16px ✓ before a checked option's text. */
export function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`size-4 shrink-0 ${className}`}
      {...STROKE}
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

/** The 16px arrow at the end of a row that leads to another page. */
export function ArrowIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`size-4 shrink-0 ${className}`}
      {...STROKE}
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

/** The 18px + of an action that opens something new ("Nova Sessão"). */
export function PlusIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={`size-[18px] shrink-0 ${className}`}
      {...STROKE}
      strokeWidth={3}
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}
