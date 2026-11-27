// The rating screen's draft (#144): the Notas the Dono gave and the films
// she passed over, kept in the browser (one key per Dono) until Pronto
// writes them. `sent` holds the films of the Pronto on its way: once the
// screen hears they were written, they leave the draft; refused, they stay.
// `history` is the order she rated or passed over the films still in the
// draft, so "Voltar ao anterior" undoes the last one (#274).

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
  history: string[]
}

const emptyDraft = (): Draft => ({
  ratings: {},
  skipped: [],
  sent: [],
  history: [],
})

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
    return {
      ratings,
      skipped: ids(value.skipped),
      sent: ids(value.sent),
      history: ids(value.history),
    }
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
  const sent = new Set(draft.sent)
  const history = draft.history.filter((id) => !sent.has(id))
  return { ...draft, ratings, sent: [], history }
}

/** The history with `film` last. */
const last = (history: readonly string[], film: string) => [
  ...history.filter((id) => id !== film),
  film,
]

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
  history: last(draft.history, film.id),
})

/** The draft with the film passed over ("Não vi"). */
export const withSkipped = (draft: Draft, film: string): Draft => ({
  ...draft,
  skipped: [...draft.skipped, film],
  history: last(draft.history, film),
})

/** The draft without the film's Nota ("Tirar"). */
export function withoutRating(draft: Draft, film: string): Draft {
  const ratings = { ...draft.ratings }
  delete ratings[film]
  return {
    ...draft,
    ratings,
    history: draft.history.filter((id) => id !== film),
  }
}

/** The film of the last Nota or "Não vi" still in the draft, if any. */
export const lastTaken = (draft: Draft): string | undefined =>
  draft.history.at(-1)

/** The draft without its last Nota or "Não vi" ("Voltar ao anterior"): the
 * film comes back to the card. */
export function undoLast(draft: Draft): Draft {
  const film = lastTaken(draft)
  if (film === undefined) return draft
  const ratings = { ...draft.ratings }
  delete ratings[film]
  return {
    ...draft,
    ratings,
    skipped: draft.skipped.filter((id) => id !== film),
    history: draft.history.slice(0, -1),
  }
}

/** The draft as Pronto leaves: its Notas on their way. */
export const sending = (draft: Draft): Draft => ({
  ...draft,
  sent: Object.keys(draft.ratings),
})
