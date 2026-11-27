// The words of the chosen film on a closed Cartaz (#264): what each
// Presente was predicted to give beside how she received it, both on the
// 1 to 10 scale of the Já vi (#272).

export const CHOSEN = {
  title: 'Filme escolhido',
  /** The chosen film without a card: "Curta da Madrugada (2010)". */
  film: (title: string, year: number | null) =>
    year === null ? title : `${title} (${year})`,
  predicted: (rating: string) => `previsto ${rating}`,
  /** Her Nota on the Já vi's scale, said with it (#272). */
  rating: (rating: string) => `deu ${rating} de 10`,
  reaction: { liked: 'gostou', neutral: 'neutro', disliked: 'não gostou' },
  /** Her comment in the Feedback, quoted (#272). */
  comment: (text: string) => `“${text}”`,
  /** The Presentes with no Reação, in one muted line (#272). */
  noReaction: (names: string) => `${names}: sem reação`,
  line: (name: string, parts: readonly string[]) =>
    `${name}: ${parts.join(' · ')}`,
} as const
