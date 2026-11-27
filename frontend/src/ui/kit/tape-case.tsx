import type { ReactNode } from 'react'

// The tape's black case (DESIGN.md, Fita): 8px radius, a 5px border all
// round, the cover inside (2:3, 3px radius). The case is the same black in
// both themes (The Same Objects Rule).

export function TapeCase({
  cover,
  className = '',
}: {
  /** The poster or, without one, the title on `surface-2`. */
  cover: ReactNode
  className?: string
}) {
  return (
    <div
      className={`relative flex shrink-0 flex-col self-start rounded-case bg-case p-1.25 ${className}`}
    >
      <div className="relative grid aspect-[2/3] place-items-center overflow-hidden rounded-cover bg-surface-2 p-md text-center font-display text-meta-strong text-ink-2">
        {cover}
      </div>
    </div>
  )
}
