// Which service a Pessoa's ZIP came from, by what is inside: Letterboxd's
// export has its CSVs (`watched.csv`, `ratings.csv`...), Trakt's has its
// ratings and history JSONs. The import page has one file field and lets
// the server tell them apart (#163). IMDb's ratings come as a CSV, not a
// ZIP, and are told by their header (#285).
import { isImdbRatings } from './imdb-ratings.ts'
import { findCsvs } from './letterboxd-export.ts'
import { isTraktFile } from './trakt-export.ts'
import { Zip, ZipError } from './zip.ts'

export type ExportSource = 'letterboxd' | 'trakt' | 'imdb'

/** The service whose reader takes the file: a ZIP by what it holds, a CSV
 * by its header; null when none does. */
export const exportSource = (content: Uint8Array): ExportSource | null => {
  let names: readonly string[]
  try {
    names = new Zip(Buffer.from(content)).names()
  } catch (error) {
    if (error instanceof ZipError) return isImdbRatings(content) ? 'imdb' : null
    throw error
  }
  if (findCsvs(names).size > 0) return 'letterboxd'
  if (names.some(isTraktFile)) return 'trakt'
  return null
}
