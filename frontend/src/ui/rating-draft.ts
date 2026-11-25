// The rating screen's draft (#144): the Notas the Dono gave and the films
// she passed over, kept in the browser (one key per Dono) until Pronto
// writes them. `sent` holds the films of the Pronto on its way: once the
// screen hears they were written, they leave the draft; refused, they stay.

import { openStorage } from './billboard-marks'

/** A film with its Nota, as the draft lists it. */
export type DraftRating = {
  title: string
  year: number | null
  rating: number
}

export type Draft = {
  ratings: Record<string, DraftRating>
  skipped: string[]
  sent: string[]
}

const emptyDraft = (): Draft => ({ ratings: {}, skipped: [], sent: [] })

const storageKey = (person: string) => `filmes-notas:${person}`

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const ids = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string')
    : []

function ratingFrom(value: unknown): DraftRating | null {
  if (!isRecord(value)) return null
  const rating = Number(value.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 10) return null
  if (typeof value.title !== 'string') return null
  const year = typeof value.year === 'number' ? value.year : null
  return { title: value.title, year, rating }
}

/** Reads a stored draft, keeping only what a draft holds. */
export function parseDraft(text: string | null): Draft {
  try {
    const value: unknown = text === null ? null : JSON.parse(text)
    if (!isRecord(value)) return emptyDraft()
    const ratings: Record<string, DraftRating> = {}
    if (isRecord(value.ratings))
      for (const [id, entry] of Object.entries(value.ratings)) {
        const rating = ratingFrom(entry)
        if (rating && /^tt\d+$/.test(id)) ratings[id] = rating
      }
    return { ratings, skipped: ids(value.skipped), sent: ids(value.sent) }
  } catch {
    return emptyDraft()
  }
}

/** The stored draft's text, null when there is none or no storage. */
export const storedDraft = (person: string): string | null =>
  openStorage()?.getItem(storageKey(person)) ?? null

export const loadDraft = (person: string): Draft =>
  parseDraft(storedDraft(person))

export function saveDraft(person: string, draft: Draft): void {
  openStorage()?.setItem(storageKey(person), JSON.stringify(draft))
}

/** After Pronto: written, the sent Notas leave; refused, they stay. */
export function settle(draft: Draft, written: boolean): Draft {
  if (draft.sent.length === 0) return draft
  if (!written) return { ...draft, sent: [] }
  const ratings = { ...draft.ratings }
  for (const id of draft.sent) delete ratings[id]
  return { ...draft, ratings, sent: [] }
}

/** The draft with the film's Nota, given or changed. */
export const withRating = (
  draft: Draft,
  film: { id: string; title: string; year: number | null },
  rating: number,
): Draft => ({
  ...draft,
  ratings: {
    ...draft.ratings,
    [film.id]: { title: film.title, year: film.year, rating },
  },
})

/** The draft with the film passed over ("Não vi"). */
export const withSkipped = (draft: Draft, film: string): Draft => ({
  ...draft,
  skipped: [...draft.skipped, film],
})

/** The draft without the film's Nota ("Tirar"). */
export function withoutRating(draft: Draft, film: string): Draft {
  const ratings = { ...draft.ratings }
  delete ratings[film]
  return { ...draft, ratings }
}

/** The draft as Pronto leaves: its Notas on their way. */
export const sending = (draft: Draft): Draft => ({
  ...draft,
  sent: Object.keys(draft.ratings),
})
