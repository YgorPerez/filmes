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
      className="inline-flex gap-0.75"
    >
      {[1, 2, 3].map((dot) => (
        <span
          key={dot}
          className={`size-[7px] rounded-round border-(length:--border-width-stroke) border-ink ${
            dot <= filled ? 'bg-ink' : ''
          }`}
        />
      ))}
    </span>
  )
}

/** In Claude, where no page head names them: a Presente per avatar with her name, and the three Forças in words on
 * a line of their own, so the legend never runs into the names (#277). */
export function PeopleLegend({ billboard }: { billboard: BillboardModel }) {
  return (
    <div className="flex flex-col gap-xs text-meta text-ink-2">
      <p className="flex flex-wrap items-center gap-x-xl gap-y-xs">
        {billboard.attendees.map((p) => (
          <span
            key={p.slug}
            className="inline-flex items-center gap-xs text-ink"
          >
            <Avatar person={p} />
            {p.name}
          </span>
        ))}
      </p>
      <p className="flex flex-wrap items-center gap-x-xl gap-y-xs">
        {(['strong', 'moderate', 'weak'] as const).map((level) => (
          <span key={level} className="inline-flex items-center gap-xs">
            <Strength strength={level} />
            {BILLBOARD.strength[level]}
          </span>
        ))}
      </p>
    </div>
  )
}

/** The three Forças in words, behind a "?" (#272): the Presentes are in
 * the page's head, and the key is for who asks. */
export function Legend() {
  return (
    <details className="group/legend relative self-end">
      <summary
        aria-label={BILLBOARD.legend}
        className="grid size-touch cursor-pointer list-none place-items-center rounded-round border-(length:--border-width-stroke) border-rule bg-surface font-display text-control text-ink [&::-webkit-details-marker]:hidden"
      >
        ?
      </summary>
      <div className="absolute top-full right-0 z-20 mt-xs flex w-max max-w-[min(320px,calc(100vw-32px))] flex-col gap-sm rounded-card border border-rule bg-surface p-lg text-meta text-ink-2">
        <p>{BILLBOARD.legendLead}</p>
        <ul className="flex flex-col gap-xs">
          {(['strong', 'moderate', 'weak'] as const).map((level) => (
            <li key={level} className="inline-flex items-center gap-sm">
              <Strength strength={level} />
              {BILLBOARD.strength[level]}
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}

/** What changed from the previous version, in one line ("Refeito: 2
 * saíram, 2 novos."), with why each film left behind "por quê", the
 * title in the clerk's hand. Nothing on a first version. */
export function Dropped({ billboard }: { billboard: BillboardModel }) {
  const arrived = billboard.films.filter((film) => film.new).length
  if (billboard.dropped.length === 0 && arrived === 0) return null
  const line = BILLBOARD.redone(billboard.dropped.length, arrived)
  if (billboard.dropped.length === 0)
    return <p className="text-meta text-ink-2">{line}</p>
  return (
    <details className="text-meta text-ink-2">
      <summary className="flex min-h-touch cursor-pointer list-none flex-wrap items-center gap-x-sm [&::-webkit-details-marker]:hidden">
        <span>{line}</span>
        <span className="font-semibold text-ink underline underline-offset-2">
          {BILLBOARD.redoneWhy}
        </span>
      </summary>
      <ul className="flex flex-col gap-2xs pb-xs">
        {billboard.dropped.map((d) => (
          <li key={d.id}>
            {BILLBOARD.dropped}{' '}
            <span className="font-hand text-hand-small text-ink">
              {d.title}
            </span>{' '}
            ({d.reason})
          </li>
        ))}
      </ul>
    </details>
  )
}
