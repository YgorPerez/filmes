// Which service a Pessoa's ZIP came from, by what is inside: Letterboxd's
// export has its CSVs (`watched.csv`, `ratings.csv`...), Trakt's has its
// ratings and history JSONs. The import page has one file field and lets
// the server tell them apart (#163). IMDb's ratings come as a CSV, not a
// ZIP, and are told by their header (#285). Simkl's backup is
// `SimklBackup.json`, alone or in its ZIP (#299).
import { isImdbRatings } from './imdb-ratings.ts'
import { findCsvs } from './letterboxd-export.ts'
import { isSimklBackup } from './simkl-backup.ts'
import { isTraktFile } from './trakt-export.ts'
import { Zip, ZipError } from './zip.ts'

export type ExportSource = 'letterboxd' | 'trakt' | 'imdb' | 'simkl'

/** The service whose reader takes the file: a ZIP by what it holds, a CSV
 * by its header, a JSON by its keys; null when none does. */
export const exportSource = (content: Uint8Array): ExportSource | null => {
  let names: readonly string[]
  try {
    names = new Zip(Buffer.from(content)).names()
  } catch (error) {
    if (!(error instanceof ZipError)) throw error
    if (isImdbRatings(content)) return 'imdb'
    return isSimklBackup(content) ? 'simkl' : null
  }
  if (findCsvs(names).size > 0) return 'letterboxd'
  if (names.some(isTraktFile)) return 'trakt'
  return isSimklBackup(content) ? 'simkl' : null
}
