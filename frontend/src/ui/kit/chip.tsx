// A chip (DESIGN.md, Card do filme): year, duration or genre on
// `surface-2`, Rubik 500 12px, tabular figures. A genre's chip has the dot
// of its colour before the name, like the coloured tag on a spine; the name
// is always written, the colour only reminds.

// DESIGN.md's fixed map of the IMDb genres, by the Portuguese name the
// engine writes (`packages/engine/src/catalog/genres.ts`). A genre not in a
// colour (Documentário and the rest) gets `ink-2`.
const TONES: Readonly<Record<string, string>> = {
  Drama: 'bg-genre-blue',
  Biografia: 'bg-genre-blue',
  História: 'bg-genre-blue',
  Guerra: 'bg-genre-blue',
  Mistério: 'bg-genre-violet',
  Crime: 'bg-genre-violet',
  Suspense: 'bg-genre-violet',
  Terror: 'bg-genre-violet',
  'Ficção científica': 'bg-genre-violet',
  Fantasia: 'bg-genre-violet',
  Noir: 'bg-genre-violet',
  Comédia: 'bg-genre-yellow',
  Musical: 'bg-genre-yellow',
  Música: 'bg-genre-yellow',
  Família: 'bg-genre-green',
  Animação: 'bg-genre-green',
  Aventura: 'bg-genre-orange',
  Ação: 'bg-genre-orange',
  Faroeste: 'bg-genre-orange',
  Esporte: 'bg-genre-orange',
  Romance: 'bg-genre-pink',
}

const UNCOLORED = new Set([
  'Adulto',
  'Documentário',
  'Game show',
  'Jornalismo',
  'Reality show',
  'Curta-metragem',
  'Talk show',
])

/** The dot's class of a genre's chip, or null when the chip is no genre
 * (a year, a duration). */
const toneOf = (text: string) =>
  TONES[text] ?? (UNCOLORED.has(text) ? 'bg-ink-2' : null)

export function Chip({ children }: { children: string }) {
  const tone = toneOf(children)
  return (
    <span className="inline-flex items-center gap-[5px] rounded-pill bg-surface-2 px-[9px] py-[5px] font-display text-chip text-ink tabular-nums">
      {tone && (
        <span
          aria-hidden="true"
          className={`size-[9px] shrink-0 rounded-round ${tone}`}
        />
      )}
      {children}
    </span>
  )
}
