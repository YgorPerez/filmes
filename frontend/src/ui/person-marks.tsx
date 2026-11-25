import type { ReactNode } from 'react'

// The marks of the Pessoas screens and of the rating screen (#148), in the
// Locadora de bairro: the ficha with its torn stub, the Força in three dots,
// a Nota on the orange disc of the chosen Nota, and the arrow of a row.

/** A ficha of the counter: a card whose heading sits on the stub, split from
 * the rest by a dashed rule (DESIGN.md, Ficha da última Sessão). `count`
 * goes on the right of the stub; `lead` under it says what the ficha
 * holds. */
export function Ficha({
  id,
  title,
  count,
  lead,
  children,
}: {
  id: string
  title: string
  count?: string
  lead?: string
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex scroll-mt-2xl flex-col rounded-card border border-rule bg-surface"
    >
      <div className="flex items-baseline justify-between gap-sm border-b border-dashed border-rule px-xl pt-lg pb-md">
        <h2
          id={id}
          className="scroll-mt-2xl font-display text-[13px] leading-tight font-extrabold tracking-[0.06em] text-ink-2 uppercase"
        >
          {title}
        </h2>
        {count !== undefined && (
          <span className="font-display text-meta text-ink-2 tabular-nums">
            {count}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-xl p-xl">
        {lead && <p className="text-meta text-ink-2">{lead}</p>}
        {children}
      </div>
    </section>
  )
}

const FILLED = { strong: 3, moderate: 2, weak: 1, guess: 0 } as const

/** The Força in three 7px dots, the level in the fill (●●● forte, ●●○
 * moderada, ●○○ fraca, ○○○ palpite), with the word beside it. */
export function StrengthDots({
  strength,
  word,
}: {
  strength: keyof typeof FILLED
  word: string
}) {
  return (
    <span className="inline-flex items-center gap-xs text-meta text-ink-2">
      <span
        role="img"
        aria-label={`Força ${word}`}
        className="inline-flex gap-[3px]"
      >
        {[1, 2, 3].map((dot) => (
          <span
            key={dot}
            className={`size-[7px] rounded-round border-[1.5px] border-ink ${
              dot <= FILLED[strength] ? 'bg-ink' : ''
            }`}
          />
        ))}
      </span>
      <span aria-hidden="true">{word}</span>
    </span>
  )
}

/** A Nota already given, on the orange disc of the chosen Nota. */
export function RatingDisc({ children }: { children: number }) {
  return (
    <span
      aria-hidden="true"
      className="inline-grid size-9 shrink-0 place-items-center rounded-round bg-sticker-orange font-display text-[15px] font-extrabold text-on-sticker tabular-nums"
    >
      {children}
    </span>
  )
}

/** The 16px arrow at the end of a row that opens a page. */
export function Chevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 shrink-0 text-ink-2"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 3 5 5-5 5" />
    </svg>
  )
}
