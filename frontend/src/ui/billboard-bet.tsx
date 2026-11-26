import { BILLBOARD } from './billboard.copy'

// The Aposta's stamp (DESIGN.md, Adesivos de estado; #178): the clerk's
// violet stamp, on a patch of surface so it reads over any poster in both
// themes, at the bottom left of the cover, away from NOVO at the top
// right (a bet that came in on regenerating has both). The caller places
// it, as with the stickers.

export function BetStamp({ className = '' }: { className?: string }) {
  const { card } = BILLBOARD
  return (
    <span
      title={card.betHint}
      className={`inline-block -rotate-6 rounded-cover border-2 border-stamp bg-surface px-sm pt-xs pb-[5px] font-display text-sticker text-stamp uppercase motion-safe:animate-stick ${className}`}
    >
      {card.bet}
    </span>
  )
}
