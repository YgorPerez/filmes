// The app's one set of drawn icons (DESIGN.md, from the Locadora de bairro
// prototype): authored SVG on a 24px grid, a 1.8 stroke in the text's
// colour, round caps, never a glyph or an emoji. Always beside a word, so
// they are hidden from screen readers. The Cartaz keeps its own copy
// (billboard-icons.tsx), since the MCP Apps view is self-contained.

const PATHS = {
  home: <path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" />,
  film: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="1.5" />
      <path d="M3.5 9h17M3.5 15h17M8 5v4M16 5v4M8 15v4M16 15v4" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6" />
      <circle cx="17" cy="9.5" r="2.4" />
      <path d="M15.6 14.6c2.4-.3 4.4 1.1 4.9 3.9" />
    </>
  ),
  taste: (
    <path d="M12 19.5s-7.5-4.4-7.5-9.6A4.1 4.1 0 0 1 12 7.6a4.1 4.1 0 0 1 7.5 2.3c0 5.2-7.5 9.6-7.5 9.6z" />
  ),
  logout: (
    <>
      <path d="M14 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H14" />
      <path d="M10.5 12H20M16.5 8.5L20 12l-3.5 3.5" />
    </>
  ),
  tools: (
    <>
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="17" r="2" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M15 9V5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15H9" />
    </>
  ),
  arrow: <path d="M5 12h14M13.5 6.5L19 12l-5.5 5.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  alert: (
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4.5M12 17.5v.1" />
    </>
  ),
} as const

export type IconName = keyof typeof PATHS

export function Icon({
  name,
  className = 'size-5',
}: {
  name: IconName
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {PATHS[name]}
    </svg>
  )
}
