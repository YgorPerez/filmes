import type { Billboard as BillboardModel, BillboardLine } from '@filmes/engine'
import { BILLBOARD } from './billboard.copy'
import { Avatar } from './kit/person'

// The pieces of the Cartaz above the cards (DESIGN.md, Legenda, Força and
// "Saiu da prateleira"), and the Força the cards repeat on each Evidência.

const LEVELS = { strong: 3, moderate: 2, weak: 1 } as const

/** Três pontos de 7px em tinta: the level is how many are filled, never
 * the colour; the `aria-label` says it. */
export function Strength({
  strength,
}: {
  strength: BillboardLine['strength']
}) {
  const filled = LEVELS[strength]
  return (
    <span
      role="img"
      aria-label={BILLBOARD.strengthLabel(BILLBOARD.strength[strength])}
      data-level={filled}
      className="inline-flex gap-[3px]"
    >
      {[1, 2, 3].map((dot) => (
        <span
          key={dot}
          className={`size-[7px] rounded-round border-[1.5px] border-ink ${
            dot <= filled ? 'bg-ink' : ''
          }`}
        />
      ))}
    </span>
  )
}

/** A Presente per avatar with her name, and the three Forças in words. */
export function Legend({ billboard }: { billboard: BillboardModel }) {
  return (
    <p className="flex flex-wrap items-center gap-x-xl gap-y-xs text-meta text-ink-2">
      {billboard.attendees.map((p) => (
        <span key={p.slug} className="inline-flex items-center gap-xs text-ink">
          <Avatar person={p} />
          {p.name}
        </span>
      ))}
      {(['strong', 'moderate', 'weak'] as const).map((level) => (
        <span key={level} className="inline-flex items-center gap-xs">
          <Strength strength={level} />
          {BILLBOARD.strength[level]}
        </span>
      ))}
    </p>
  )
}

/** What left the previous version and why, one per line, the title in
 * the clerk's hand. */
export function Dropped({ billboard }: { billboard: BillboardModel }) {
  if (billboard.dropped.length === 0) return null
  return (
    <ul className="flex flex-col gap-2xs">
      {billboard.dropped.map((d) => (
        <li key={d.id} className="text-meta text-ink-2">
          {BILLBOARD.dropped}{' '}
          <span className="font-hand text-[15px] text-ink">{d.title}</span> (
          {d.reason})
        </li>
      ))}
    </ul>
  )
}
