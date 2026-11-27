// What an import did to the Pessoa's taste, film by film (#274): the films
// that got their first Nota, the ones whose Nota in force changed (a Trakt
// Nota newer than the Letterboxd one replaces it), the ones it brought with
// the same Nota they had, and the films seen for the first time. The Fato
// counts of each import say how many rows its source holds; these say what
// she sees on her Notas list, which counts films.

import { Effect } from 'effect'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'

/** Her Notas in force and her seen films, before an import. */
export interface TasteSnapshot {
  /** Film id to the Nota in force (0.5 to 5). */
  readonly ratings: ReadonlyMap<string, number>
  readonly seen: ReadonlySet<string>
}

/** A film whose Nota in force changed. */
export interface RatingChange {
  readonly film: string
  readonly title: string | null
  readonly year: number | null
  /** 0.5 to 5, as in `notas`. */
  readonly from: number
  readonly to: number
}

export interface TasteChange {
  /** Films with a Nota now and none before. */
  readonly newRatings: number
  /** Films whose Nota in force is another one now. */
  readonly changedRatings: readonly RatingChange[]
  /** Films with a Nota of this import's kind that kept the Nota they had. */
  readonly repeatedRatings: number
  /** Films seen now and not before, without a Nota. */
  readonly newSeen: number
}

/** Her Notas in force and seen films now. */
export const tasteSnapshot = (
  db: Connection,
  slug: string,
): Effect.Effect<TasteSnapshot, SqliteError> =>
  Effect.gen(function* () {
    const ratings = yield* db.all(
      'SELECT filme_id, nota FROM notas_vigentes WHERE pessoa = ?',
      slug,
    )
    const seen = yield* db.all(
      'SELECT DISTINCT filme_id FROM ja_vistos WHERE pessoa = ?',
      slug,
    )
    return {
      ratings: new Map(
        ratings.map((row) => [String(row.filme_id), Number(row.nota)]),
      ),
      seen: new Set(seen.map((row) => String(row.filme_id))),
    }
  })

/** What changed since `before`, for an import of `kind` (the prefix of its
 * Fatos' ids: `letterboxd`, `trakt`, `imdb`...). */
export const tasteChange = (
  db: Connection,
  slug: string,
  kind: string,
  before: TasteSnapshot,
): Effect.Effect<TasteChange, SqliteError> =>
  Effect.gen(function* () {
    const after = yield* tasteSnapshot(db, slug)
    const brought = new Set(
      (yield* db.all(
        'SELECT DISTINCT filme_id FROM notas WHERE pessoa = ? AND fato_id LIKE ?',
        slug,
        `${kind}:%`,
      )).map((row) => String(row.filme_id)),
    )
    let newRatings = 0
    let repeatedRatings = 0
    const changed: { film: string; from: number; to: number }[] = []
    for (const [film, rating] of after.ratings) {
      const was = before.ratings.get(film)
      if (was === undefined) newRatings += 1
      else if (was !== rating) changed.push({ film, from: was, to: rating })
      else if (brought.has(film)) repeatedRatings += 1
    }
    let newSeen = 0
    for (const film of after.seen)
      if (!before.seen.has(film) && !after.ratings.has(film)) newSeen += 1
    const titles = new Map<string, { title: string; year: number | null }>()
    for (const { film } of changed) {
      const row = yield* db.get(
        'SELECT titulo, ano FROM filmes WHERE id = ?',
        film,
      )
      if (row !== undefined)
        titles.set(film, {
          title: String(row.titulo),
          year: row.ano === null ? null : Number(row.ano),
        })
    }
    return {
      newRatings,
      changedRatings: changed
        .toSorted((a, b) => a.film.localeCompare(b.film))
        .map((change) => ({
          ...change,
          title: titles.get(change.film)?.title ?? null,
          year: titles.get(change.film)?.year ?? null,
        })),
      repeatedRatings,
      newSeen,
    }
  })
