// The card header of each recommended film: the IMDb link, the genres, the
// poster, the Portuguese title and the synopsis (`recomendacao/cabecalho.py`).
//
// Presentation fields, outside the Evidence: not a Motivo, no strength, and
// the verifier does not look at them. Poster, title and synopsis come from
// one TMDB lookup in pt-BR, only for the films returned; without a key or
// on a failure they are null and the source warns once.

import { Effect } from 'effect'
import { genreInPortuguese } from '../catalog/genres.ts'
import { PY_WHITESPACE_CLASS } from '../compat/whitespace.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import type { Run } from '../runtime/Run.ts'
import { Tmdb } from '../sources/Tmdb.ts'
import { text } from '../sqlite/row.ts'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'
import type { Candidate } from './candidates.ts'

export interface FilmHeader {
  readonly imdbUrl: string
  /** The IMDb genres in Portuguese, in the IMDb's order. */
  readonly genres: ReadonlyArray<string>
  readonly poster: string | null
  readonly titlePt: string | null
  /** The first sentence of the TMDB overview. */
  readonly synopsis: string | null
  readonly imdbRating: number | null
  readonly imdbVotes: number
}

/** Abbreviations that end in a period without ending the sentence ("o Dr.
 * Lemos"). */
const ABBREVIATIONS = new Set([
  'sr',
  'sra',
  'srta',
  'dr',
  'dra',
  'prof',
  'profa',
  'st',
  'sto',
  'sta',
  'jr',
  'mr',
  'mrs',
  'ms',
])

const SPACE = PY_WHITESPACE_CLASS

const SENTENCE_END = new RegExp(`[.!?…]+["'”»)]*(?=${SPACE}|$)`, 'gu')

/** The last whitespace-separated word, as Python's `rsplit(None, 1)[-1]`;
 * `undefined` when there is none. */
const lastWord = (before: string): string | undefined => {
  const words = before.split(new RegExp(`${SPACE}+`, 'u')).filter(Boolean)
  return words.at(-1)
}

/** The text up to the end of its first sentence; the whole text when no
 * sentence ends; `null` for no text. */
export const firstSentence = (overview: string | null): string | null => {
  if (!overview) return null
  for (const end of overview.matchAll(SENTENCE_END)) {
    const word = lastWord(overview.slice(0, end.index))
    if (
      end[0] === '.' &&
      word !== undefined &&
      ABBREVIATIONS.has(word.toLowerCase())
    )
      continue
    return overview.slice(0, end.index + end[0].length)
  }
  return overview
}

export const filmHeader = (
  db: Connection,
  film: Candidate,
): Effect.Effect<FilmHeader, EngineError | SqliteError, Tmdb | Run> =>
  Effect.gen(function* () {
    const genres = yield* db.all(
      'SELECT genero FROM generos_imdb WHERE filme_id = ? ORDER BY ordem',
      film.id,
    )
    const card = yield* (yield* Tmdb).card(film.id)
    return {
      imdbUrl: `https://www.imdb.com/title/${film.id}/`,
      genres: genres.map((row) => genreInPortuguese(text(row, 'genero'))),
      poster: card.poster,
      titlePt: card.titlePt,
      synopsis: firstSentence(card.overview),
      imdbRating: film.imdbRating,
      imdbVotes: film.votes,
    }
  })
