// The ZIP a Pessoa exports from Letterboxd (`importar/zip_letterboxd.py`).
//
// Letterboxd does not document the columns; these are the real exports'
// (research #4):
//
//     watched.csv     Date,Name,Year,Letterboxd URI
//     ratings.csv     Date,Name,Year,Letterboxd URI,Rating
//     diary.csv       Date,Name,Year,Letterboxd URI,Rating,Rewatch,Tags,Watched Date
//     reviews.csv     Date,Name,Year,Letterboxd URI,Rating,Rewatch,Review,Tags,Watched Date
//     watchlist.csv   Date,Name,Year,Letterboxd URI
//
// A film is the pair (Name, Year). The `Letterboxd URI` is no use: in the
// diary and the reviews it points to the diary entry, not the film.
// `reviews.csv` has HTML, commas and line breaks inside quotes, hence a real
// CSV reader. The `deleted/`, `orphaned/` and `lists/` folders stay out.

import { factId, pyInt } from '../compat/fact-id.ts'
import { pyHtmlUnescape } from '../compat/html.ts'
import { pyIsoDate, pyParseFloat } from '../compat/parse.ts'
import {
  letterboxdSlug,
  pyJoinWords,
  pyReprStr,
  pyStrip,
} from '../compat/text.ts'
import { pyDecodeUtf8 } from '../compat/utf8.ts'
import { engineError } from '../runtime/EngineError.ts'
import { CsvDictReader, CsvError } from './csv.ts'
import { Zip, ZipError } from './zip.ts'

export const EXPORT_FILES = [
  'watched',
  'ratings',
  'diary',
  'reviews',
  'watchlist',
] as const
export type ExportFile = (typeof EXPORT_FILES)[number]

/** An RSS entry (`letterboxd-rss.ts`). */
export const RSS_FILE = 'rss'

const LEFT_OUT = new Set(['deleted', 'orphaned', 'lists'])

/** One line of a CSV (or an RSS entry), with the fields that become Fatos. */
export interface LetterboxdRow {
  readonly file: ExportFile | typeof RSS_FILE
  readonly name: string
  readonly year: number | null
  /** `Date`: when the line was logged on Letterboxd. */
  readonly date: string
  /** `Watched Date` (diary and reviews). */
  readonly watchedOn: string | null
  /** 0,5 to 5. */
  readonly rating: number | null
  /** Plain text, without HTML. */
  readonly review: string | null
  readonly tags: readonly string[]
  /** The film's TMDB id (only the RSS has it). */
  readonly tmdb: string | null
  /** Opens the Fonte: "<origin> de <Pessoa's name>". */
  readonly origin: string
}

/** A stable id for the pair (Name, Year), even when two names make the
 * same slug (`id_do_filme`). */
export const filmKey = (name: string, year: number | null): string => {
  const base = letterboxdSlug(name).slice(0, 80) || 'sem-titulo'
  const suffix = factId(
    'letterboxd',
    name,
    year === null ? null : pyInt(year),
  ).split(':')[1]
  return year !== null ? `${base}-${year}-${suffix}` : `${base}-${suffix}`
}

export const rowKey = (row: LetterboxdRow): string =>
  filmKey(row.name, row.year)

/** The Fato's date: the day she watched it when the export says, else the
 * day she logged it. */
export const rowDay = (row: LetterboxdRow): string => row.watchedOn ?? row.date

const invalid = (message: string) => engineError('invalid_file', message)

/** Each CSV's path in the ZIP: at the top or inside one folder. */
const findCsvs = (names: readonly string[]): Map<ExportFile, string> => {
  const found = new Map<ExportFile, string>()
  const byDepth = names
    .map((name, i) => ({ name, i, depth: name.split('/').length - 1 }))
    .sort((a, b) => a.depth - b.depth || a.i - b.i)
  for (const { name } of byDepth) {
    const parts = name.split('/')
    if (parts.length > 2 || parts.slice(0, -1).some((p) => LEFT_OUT.has(p)))
      continue
    const last = parts.at(-1) ?? ''
    const base = last.endsWith('.csv') ? last.slice(0, -4) : last
    const file = EXPORT_FILES.find((f) => f === base)
    if (last.endsWith('.csv') && file !== undefined && !found.has(file))
      found.set(file, name)
  }
  return found
}

const year = (value: string | null, where: string): number | null => {
  const text = pyStrip(value ?? '')
  if (!text) return null
  if (!/^[0-9]{4}$/.test(text))
    throw invalid(`${where}: ano inválido: ${pyReprStr(text)}`)
  return Number(text)
}

function day(value: string | null, where: string, required: true): string
function day(
  value: string | null,
  where: string,
  required: false,
): string | null
function day(
  value: string | null,
  where: string,
  required: boolean,
): string | null {
  const text = pyStrip(value ?? '')
  if (!text) {
    if (required) throw invalid(`${where}: linha sem data`)
    return null
  }
  const iso = pyIsoDate(text)
  if (iso === null) throw invalid(`${where}: data inválida: ${pyReprStr(text)}`)
  return iso
}

const rating = (value: string | null, where: string): number | null => {
  const text = pyStrip(value ?? '')
  if (!text) return null
  let number: number
  try {
    number = pyParseFloat(text)
  } catch {
    throw invalid(`${where}: nota inválida: ${pyReprStr(text)}`)
  }
  if (!(number >= 0.5 && number <= 5))
    throw invalid(`${where}: nota fora de 0,5 a 5: ${pyReprStr(text)}`)
  return number
}

/** A review's HTML as text on one line: tags go, entities become their
 * characters. */
const reviewText = (value: string | null): string | null => {
  if (!value || !pyStrip(value)) return null
  const text = pyJoinWords(pyHtmlUnescape(value.replace(/<[^>]+>/g, ' ')))
  return text.replace(/ ([,.;:!?])/g, '$1') || null
}

const readCsv = (file: ExportFile, text: string): LetterboxdRow[] => {
  const reader = new CsvDictReader(text)
  const columns = new Set(reader.fieldnames ?? [])
  const missing = ['Date', 'Name', 'Year'].filter((c) => !columns.has(c))
  if (missing.length > 0)
    throw invalid(`${file}.csv: faltam as colunas ${missing.join(', ')}`)
  const rows: LetterboxdRow[] = []
  for (const { row, lineNum } of reader.rows()) {
    const where = `${file}.csv, linha ${lineNum}`
    const name = pyStrip(row.get('Name') ?? '')
    if (!name) throw invalid(`${where}: filme sem nome`)
    rows.push({
      file,
      name,
      year: year(row.get('Year') ?? null, where),
      date: day(row.get('Date') ?? null, where, true),
      watchedOn: day(row.get('Watched Date') ?? null, where, false),
      rating: rating(row.get('Rating') ?? null, where),
      review: reviewText(row.get('Review') ?? null),
      tags: (row.get('Tags') ?? '')
        .split(',')
        .map(pyStrip)
        .filter((t) => t !== ''),
      tmdb: null,
      origin: 'Letterboxd',
    })
  }
  return rows
}

/** The rows of a Letterboxd export (`zip_letterboxd.ler`): `name` is the
 * file's name, for the messages. Throws the `EngineError` Python raised. */
export const readLetterboxdExport = (
  name: string,
  content: Uint8Array,
): LetterboxdRow[] => {
  try {
    const zip = new Zip(Buffer.from(content))
    const found = findCsvs(zip.names())
    if (found.size === 0)
      throw invalid(
        `${name}: não parece um export do Letterboxd (sem watched.csv, ratings.csv, diary.csv, reviews.csv nem watchlist.csv)`,
      )
    const rows: LetterboxdRow[] = []
    for (const file of EXPORT_FILES) {
      const path = found.get(file)
      if (path === undefined) continue
      const decoded = pyDecodeUtf8(zip.read(path), true)
      if (decoded.error !== undefined)
        throw invalid(`${name}: ${decoded.error}`)
      rows.push(...readCsv(file, decoded.text))
    }
    return rows
  } catch (error) {
    if (error instanceof ZipError)
      throw invalid(
        error.kind === 'bad_zip'
          ? `${name}: não é um ZIP`
          : `${name}: ${error.message}`,
      )
    if (error instanceof CsvError) throw invalid(`${name}: ${error.message}`)
    throw error
  }
}
