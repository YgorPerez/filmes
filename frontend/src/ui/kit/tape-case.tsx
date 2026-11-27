import { useState, type ReactNode } from 'react'

// The tape's black case (DESIGN.md, Fita): 8px radius, a 5px border all
// round, the cover inside (2:3, 3px radius). The case is the same black in
// both themes (The Same Objects Rule).

export function TapeCase({
  cover,
  small = false,
  className = '',
}: {
  /** The poster or, without one, the title on `surface-2`. */
  cover: ReactNode
  /** A narrow tape (80px, the queue's): the title in label size, with
   * less margin, so it still fits on the cover (#274). */
  small?: boolean
  className?: string
}) {
  return (
    <div
      className={`relative flex shrink-0 flex-col self-start rounded-case bg-case p-1.25 ${className}`}
    >
      <div
        className={`relative grid aspect-[2/3] place-items-center overflow-hidden rounded-cover bg-surface-2 text-center font-display text-ink-2 ${small ? 'p-2xs text-label break-words hyphens-auto' : 'p-md text-meta-strong'}`}
      >
        {cover}
      </div>
    </div>
  )
}

/** The poster on the cover, or the title when there is none or it fails
 * to load (#274): a TMDB 404 shows the title cover DESIGN.md asks for,
 * never the broken-image glyph. An image that failed before the page
 * hydrated is caught when it mounts. */
export function PosterCover({
  src,
  title,
  alt,
  fallback,
  lazy = false,
}: {
  src: string | null
  title: string
  alt: string
  /** What a small case shows instead of the title. */
  fallback?: ReactNode
  lazy?: boolean
}) {
  const [failed, setFailed] = useState<string | null>(null)
  if (src === null || failed === src)
    return fallback ?? <span aria-hidden="true">{title}</span>
  return (
    <img
      src={src}
      alt={alt}
      loading={lazy ? 'lazy' : undefined}
      onError={() => setFailed(src)}
      ref={(img) => {
        if (img?.complete && img.naturalWidth === 0) setFailed(src)
      }}
      className="absolute inset-0 size-full object-cover"
    />
  )
}
