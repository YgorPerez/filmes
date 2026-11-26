// The words of the chosen film on a closed Cartaz (#264): what each
// Presente was predicted to give beside how she received it.

export const CHOSEN = {
  title: 'Filme escolhido',
  /** The chosen film without a card: "Curta da Madrugada (2010)". */
  film: (title: string, year: number | null) =>
    year === null ? title : `${title} (${year})`,
  predicted: (rating: string) => `previsto ${rating}`,
  rating: (rating: string) => `achou ${rating}`,
  reaction: { liked: 'gostou', neutral: 'neutro', disliked: 'não gostou' },
  line: (name: string, parts: readonly string[]) =>
    `${name}: ${parts.join(' · ')}`,
} as const
