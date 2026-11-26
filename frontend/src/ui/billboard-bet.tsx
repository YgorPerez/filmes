import type { ReactNode } from 'react'

// The Aposta's stamp (DESIGN.md, Adesivos de estado; #178): the clerk's
// violet stamp, on a patch of surface so it reads over any poster in both
// themes, at the bottom left of the cover, away from NOVO at the top
// right (a bet that came in on regenerating has both). The caller places
// it and gives its word (`BILLBOARD.card.bet`), as with the stickers. Why
// it is a bet (`betHint`) the card says in its text, beside the stamp: a
// hover `title` never opens on the phone.

export function BetStamp({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-block -rotate-6 rounded-cover border-2 border-stamp bg-surface px-sm pt-xs pb-1.25 font-display text-sticker text-stamp uppercase motion-safe:animate-stick ${className}`}
    >
      {children}
    </span>
  )
}
