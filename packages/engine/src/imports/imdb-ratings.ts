// The rows of an IMDb ratings CSV ("Your Ratings" > Export, #285), the
// format `export/imdb.ts` writes: `Const` is the tconst, `Your Rating` the
// rating on IMDb's 1 to 10 and `Date Rated` the day. The other columns are
// IMDb's description of the film, which the Catálogo already has; only the
// title is kept, for the report of films outside it.
import { pyDecodeUtf8 } from '../compat/utf8.ts'
import { engineError } from '../runtime/EngineError.ts'
import { CsvDictReader, CsvError } from './csv.ts'

export interface ImdbRatingRow {
  /** The tconst. */
  readonly film: string
  /** On the Notas' 0.5 to 5 scale: IMDb's rating halved. */
  readonly rating: number
  /** `2025-03-08`. */
  readonly date: string
  readonly title: string | null
}

const COLUMNS = ['Const', 'Your Rating', 'Date Rated'] as const

const TCONST = /^tt[0-9]+$/
const RATING = /^(?:[1-9]|10)$/
const DAY = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/

const invalid = (message: string) => engineError('invalid_file', message)

/** A calendar day written as `YYYY-MM-DD`. */
const isDay = (text: string): boolean => {
  const match = DAY.exec(text)
  if (match === null) return false
  const date = new Date(`${text}T00:00:00Z`)
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text
  )
}

const hasColumns = (reader: CsvDictReader): boolean => {
  const header = new Set(reader.fieldnames ?? [])
  return COLUMNS.every((column) => header.has(column))
}

/** Whether the bytes are an IMDb ratings CSV, by its header: the import
 * page's one file field takes it too (#163). */
export const isImdbRatings = (content: Uint8Array): boolean => {
  const decoded = pyDecodeUtf8(content, true)
  if (decoded.error !== undefined) return false
  try {
    return hasColumns(new CsvDictReader(decoded.text))
  } catch (error) {
    if (error instanceof CsvError) return false
    throw error
  }
}

/** The rows of the CSV, in its order: `name` is the file's name, for the
 * messages. A row that breaks the format throws `invalid_file`. */
export const readImdbRatings = (
  name: string,
  content: Uint8Array,
): ImdbRatingRow[] => {
  const decoded = pyDecodeUtf8(content, true)
  if (decoded.error !== undefined)
    throw invalid(`${name}: o CSV do IMDb não está em UTF-8`)
  try {
    const reader = new CsvDictReader(decoded.text)
    if (!hasColumns(reader))
      throw invalid(
        `${name}: CSV sem as colunas Const, Your Rating e Date Rated do IMDb`,
      )
    const rows: ImdbRatingRow[] = []
    for (const { row, lineNum } of reader.rows()) {
      const where = `${name}, linha ${lineNum}`
      const film = (row.get('Const') ?? '').trim()
      if (!TCONST.test(film))
        throw invalid(`${where}: Const não é um ID do IMDb (tt…)`)
      const rating = (row.get('Your Rating') ?? '').trim()
      if (!RATING.test(rating))
        throw invalid(`${where}: nota fora da escala inteira de 1 a 10`)
      const date = (row.get('Date Rated') ?? '').trim()
      if (!isDay(date)) throw invalid(`${where}: data inválida em Date Rated`)
      const title = (row.get('Title') ?? '').trim()
      rows.push({
        film,
        rating: Number(rating) / 2,
        date,
        title: title === '' ? null : title,
      })
    }
    return rows
  } catch (error) {
    if (error instanceof CsvError) throw invalid(`${name}: CSV inválido`)
    throw error
  }
}
