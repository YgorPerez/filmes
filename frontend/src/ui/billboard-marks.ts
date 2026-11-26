// What the Dono marks on the Cartaz [billboard], as the page holds it, and
// the two ways it leaves the page: the text (`billboardText`, the same one
// `answerBillboard` reads) and the browser's storage, one key per Session
// and version, so a reload of the page (the T3 frame, a tab switch) gives
// the marks back. Pure, and free of the app: the MCP Apps view (#111) uses
// it too.

import type { Billboard } from '@filmes/engine'
import {
  billboardText,
  type BillboardState,
} from '@filmes/engine/billboard-text'

/** One film's marks. A Nota is the field's text until it leaves the page. */
export type FilmMarks = {
  seen: string[]
  ratings: Record<string, string>
  thoughts: Record<string, string>
  swap: boolean
  stars: number
  comment: string
}

/** `moods` are the Clima chips the Dono left on; null until she touches
 * one, which keeps the version's. */
export type Marks = {
  addition: string
  moods: string[] | null
  films: Record<string, FilmMarks>
}

const NO_MARKS: FilmMarks = {
  seen: [],
  ratings: {},
  thoughts: {},
  swap: false,
  stars: 0,
  comment: '',
}

const emptyMarks = (): Marks => ({ addition: '', moods: null, films: {} })

/** The chips that are on: the Dono's, else the version's. */
export const chosenMoods = (model: Billboard, marks: Marks) =>
  new Set(marks.moods ?? model.moods)

/** The chips of the Cartaz that are in `moods`, in the chips' order. */
const inChipOrder = (model: Billboard, moods: Iterable<unknown>) => {
  const wanted = new Set(moods)
  return model.moodChoices.filter((m) => wanted.has(m))
}

/** The Climas the Dono chose, in the chips' order, when they are not the
 * version's; null when they are. */
function otherMoods(model: Billboard, marks: Marks): string[] | null {
  if (marks.moods === null) return null
  const chosen = inChipOrder(model, marks.moods)
  const before = new Set(model.moods)
  const same =
    chosen.length === before.size && chosen.every((m) => before.has(m))
  return same ? null : chosen
}

export const marksOf = (marks: Marks, id: string): FilmMarks =>
  marks.films[id] ?? NO_MARKS

/** A Nota of 1 to 10, the Feedback's scale; anything else is none. */
const rating = (text: string | undefined): number | undefined => {
  const value = Math.round(Number(text))
  return text && value >= 1 && value <= 10 ? value : undefined
}

/** What `billboardText` reads. Only who marked Já vi has a Nota or a
 * thought. */
function billboardState(model: Billboard, marks: Marks): BillboardState {
  return {
    session: model.session,
    version: model.version,
    attendees: model.attendees.map((p) => p.slug),
    addition: marks.addition,
    moods: otherMoods(model, marks),
    films: model.films.map((film) => {
      const m = marksOf(marks, film.id)
      const ratings: Record<string, number> = {}
      const thoughts: Record<string, string> = {}
      for (const slug of m.seen) {
        const value = rating(m.ratings[slug])
        if (value !== undefined) ratings[slug] = value
        thoughts[slug] = m.thoughts[slug] ?? ''
      }
      return {
        position: film.position,
        id: film.id,
        seen: m.seen,
        ratings,
        thoughts,
        swap: m.swap,
        stars: m.stars,
        comment: m.comment,
      }
    }),
  }
}

/** The text to paste in the chat or to send. */
export const replyText = (model: Billboard, marks: Marks) =>
  billboardText(billboardState(model, marks))

/** The text has a mark: more than its header line. */
export const hasMarks = (text: string) => text.trim().includes('\n')

/** How many films carry each mark, for the line above Enviar. */
export function markCounts(model: Billboard, marks: Marks) {
  const films = model.films.map((f) => marksOf(marks, f.id))
  return {
    swap: films.filter((m) => m.swap).length,
    seen: films.filter((m) => m.seen.length > 0).length,
    stars: films.filter((m) => m.stars > 0).length,
    comments: films.filter((m) => m.comment.trim() !== '').length,
    addition: marks.addition.trim() !== '',
    mood: otherMoods(model, marks) !== null,
  }
}

// --- the browser's storage ---------------------------------------------------

/** One key per Session and version, as the old Cartaz had. */
const storageKey = (model: Billboard) =>
  `filmes-cartaz:${model.session}:v${model.version}`

/** The browser's storage, or null when it is missing or blocked (a private
 * window, the T3 Code frame): then nothing is kept and nothing is said. */
export function openStorage(): Storage | null {
  try {
    const store = window.localStorage
    const probe = 'filmes-cartaz:probe'
    store.setItem(probe, '1')
    store.removeItem(probe)
    return store
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const strings = (value: unknown): Record<string, string> =>
  isRecord(value)
    ? Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      )
    : {}

/** One film's stored marks, kept only for the Presentes of the Cartaz. */
function filmFrom(value: unknown, attendees: readonly string[]): FilmMarks {
  if (!isRecord(value)) return NO_MARKS
  const seen = new Set(Array.isArray(value.seen) ? value.seen : [])
  const stars = Number(value.stars)
  return {
    seen: attendees.filter((slug) => seen.has(slug)),
    ratings: strings(value.ratings),
    thoughts: strings(value.thoughts),
    swap: value.swap === true,
    stars: Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : 0,
    comment: typeof value.comment === 'string' ? value.comment : '',
  }
}

/** The marks kept for this Cartaz, as stored; null when there are none or
 * the storage is blocked. */
export const storedMarks = (model: Billboard): string | null =>
  openStorage()?.getItem(storageKey(model)) ?? null

/** The stored marks, for the Cartaz's films only; none when there are none
 * or they do not read. */
export function parseMarks(stored: string | null, model: Billboard): Marks {
  let saved: unknown
  try {
    saved = JSON.parse(stored ?? 'null')
  } catch {
    saved = null
  }
  if (!isRecord(saved)) return emptyMarks()
  const films = isRecord(saved.films) ? saved.films : {}
  const attendees = model.attendees.map((p) => p.slug)
  const moods = Array.isArray(saved.moods) ? (saved.moods as unknown[]) : null
  return {
    addition: typeof saved.addition === 'string' ? saved.addition : '',
    moods: moods === null ? null : inChipOrder(model, moods),
    films: Object.fromEntries(
      model.films
        .filter((f) => f.id in films)
        .map((f) => [f.id, filmFrom(films[f.id], attendees)]),
    ),
  }
}

/** Keeps the marks; a full or blocked storage goes on without them. */
export function saveMarks(
  store: Storage | null,
  model: Billboard,
  marks: Marks,
): void {
  try {
    store?.setItem(storageKey(model), JSON.stringify(marks))
  } catch {
    // Full or blocked: the page goes on without keeping them.
  }
}

/** Forgets the marks once they were sent. */
export function forgetMarks(store: Storage | null, model: Billboard): void {
  try {
    store?.removeItem(storageKey(model))
  } catch {
    // Blocked: nothing was kept either.
  }
}
