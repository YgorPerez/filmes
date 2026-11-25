// What the rating screen's "Pronto" posts (`POST /notas/enviar`) and what it
// hears back in its query: `?feito=<how many>` or `?erro=<refusal>`. Shared
// by the page and the server (`platform/ratings.ts`), so nothing here
// imports the engine.

import { within } from './form-fields'

/** A Nota the Dono gave on the screen: 1 to 10, as in the Cartaz's Já vi. */
export type GivenRating = { film: string; rating: number }

/** The field of a film's Nota: `nota.<tt…>`. */
export const ratingField = (film: string) => `nota.${film}`

const FIELD = /^nota\.(tt\d+)$/
const RATING = /^(?:[1-9]|10)$/

/** One Nota per film, or null when there is none, or a field holds what the
 * screen never sends. */
export function parseRatings(form: FormData): GivenRating[] | null {
  const ratings: GivenRating[] = []
  for (const [name, value] of form) {
    const film = FIELD.exec(name)?.[1]
    const rating = typeof value === 'string' ? value.trim() : ''
    if (film === undefined || !RATING.test(rating)) return null
    ratings.push({ film, rating: Number(rating) })
  }
  return ratings.length === 0 ? null : ratings
}

/** Why not, in `?erro=`. */
export const RATING_REFUSALS = [
  // A field is missing or holds what the screen does not send.
  'pedido',
  // A film is not in the Catálogo.
  'alvo',
  // The engine cannot run here, or failed: the reason is in the log.
  'indisponivel',
] as const
export type RatingRefusal = (typeof RATING_REFUSALS)[number]

export const isRatingRefusal = within(RATING_REFUSALS)

/** How many Notas were written, from `?feito=`. */
export const writtenCount = (value: unknown): number | undefined => {
  const text = typeof value === 'number' ? String(value) : value
  return typeof text === 'string' && /^\d{1,4}$/.test(text)
    ? Number(text)
    : undefined
}
