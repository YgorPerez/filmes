import type { ReactNode } from 'react'

// The tape's black case (DESIGN.md, Fita): 8px radius, a 5px border on top
// and on the sides, the cover inside (2:3, 3px radius) and, under it, still
// on the case, whatever the screen puts there (the Presentes' dots, which
// wrap when they do not fit). The
// case is the same black in both themes (The Same Objects Rule).

export function TapeCase({
  cover,
  children,
  className = '',
}: {
  /** The poster or, without one, the title on `surface-2`. */
  cover: ReactNode
  /** What sits on the case under the cover. */
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      className={`relative flex shrink-0 flex-col self-start rounded-case bg-case px-1.25 pt-1.25 ${className}`}
    >
      <div className="relative grid aspect-[2/3] place-items-center overflow-hidden rounded-cover bg-surface-2 p-md text-center font-display text-meta-strong text-ink-2">
        {cover}
      </div>
      <div className="flex min-h-[5px] flex-wrap justify-center gap-x-xs gap-y-1 py-1.75 empty:p-0">
        {children}
      </div>
    </div>
  )
}
