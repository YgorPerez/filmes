// Força [strength] and Tipo [kind], the two closed lists every Evidence
// carries (`evidencia/__init__.py` FORCAS and TIPOS, in English).

/** From the weakest to the strongest: the ruler moves along this order. */
export const STRENGTHS = ['weak', 'moderate', 'strong'] as const
export type Strength = (typeof STRENGTHS)[number]

export const KINDS = [
  'metadata',
  'rating',
  'stated',
  'report',
  'review',
  'guess',
] as const
export type Kind = (typeof KINDS)[number]

/** The content links of the taste path, by their `[path.weight]` keys. */
export type Link =
  | 'director'
  | 'writer'
  | 'series'
  | 'cast'
  | 'genre'
  | 'cinematography'
  | 'producer'

/** How much a Pessoa's Ajuste [adjustment] lets a link weigh. */
export type Level = 'none' | 'low' | 'normal' | 'high'
