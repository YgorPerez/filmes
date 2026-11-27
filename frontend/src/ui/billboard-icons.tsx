// The Cartaz's few icons, drawn inline so the MCP Apps view needs nothing
// from outside: the ✓ of a marked option, the star, the expand of
// "Marcar", and the chevron of a fold. Always beside a word, so they are hidden from screen readers.

const PATHS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  star: 'M12 3.6l2.6 5.4 5.9.7-4.4 4 1.2 5.9L12 16.7l-5.3 2.9 1.2-5.9-4.4-4 5.9-.7z',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  chevron: 'M6 9l6 6 6-6',
} as const

export function Icon({
  name,
  className = 'size-4',
}: {
  name: keyof typeof PATHS
  className?: string
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
