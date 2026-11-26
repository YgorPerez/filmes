// The marks of the Pessoas screens and of the rating screen (#148), in the
// Locadora de bairro: the Força in three dots and a Nota on the orange disc
// of the chosen Nota.

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
        className="inline-flex gap-0.75"
      >
        {[1, 2, 3].map((dot) => (
          <span
            key={dot}
            className={`size-[7px] rounded-round border-(length:--border-width-stroke) border-ink ${
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
      className="inline-grid size-9 shrink-0 place-items-center rounded-round bg-sticker-orange font-display text-rating-disc text-on-sticker tabular-nums"
    >
      {children}
    </span>
  )
}
