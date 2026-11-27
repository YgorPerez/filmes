// The backups former TV Time users kept (#300; TV Time shut down on
// 2026-07-15, research #288). Two circulate, and either is a ZIP:
//
// - The GDPR export (`gdpr-data.zip`, its CSVs at the top or in one
//   folder). Films are the `entity_type=movie` rows of
//   `tracking-prod-records.csv`: `type` is watch, rewatch or towatch,
//   `alpha_range_key` is `watch-alpha-<English slug>`, `release_date` is
//   `0001-01-01` when unknown, `watch_date_range_key` is
//   `watch-date-<epoch>`. No film id at all. Ratings are in
//   `ratings-live-votes.csv` (or `ratings-v2-prod-votes.csv`), joined by
//   `uuid`, with five levels in `vote_key`.
// - The TV Time Liberator export (`tv-time-export.zip`, third-party):
//   `movies.json`, each film with `id.imdb` (or "-1"), `rating` on 1 to 10
//   (the five levels doubled), `watched_at`, `created_at` and `is_watched`.
//
// Only those files are opened. The GDPR export also holds the account's
// credentials (`access_token.csv`, `auth-prod-login.csv`) and emotions
// with the ratings' very header (`emotions-live-votes.csv`); the import
// keeps a copy with the film files alone, and of them only the film rows
// and the columns the reader takes: no series nor episode, no `user_id`
// (`keptTvTimeBackup`).
//
// A film becomes rows of the Letterboxd import's shape, which its loader
// takes: a GDPR film goes through the same resolution chain and queue, by
// title and year; a Liberator film names its tconst (`imdb`). Each watch
// is a diary row (a Já visto that day), the rating rides on the latest
// one, and towatch (or `is_watched: false`) is the watchlist.
import { casefold, isalnum, pyStrip } from '../compat/text.ts'
import { csvRow } from '../export/csv.ts'
import { pyDecodeUtf8 } from '../compat/utf8.ts'
import { engineError } from '../runtime/EngineError.ts'
import { CsvDictReader, CsvError } from './csv.ts'
import type { LetterboxdRow } from './letterboxd-export.ts'
import { zipStored } from './zip-write.ts'
import { Zip, ZipError } from './zip.ts'

/** The kind of a Pessoa's `imports:` records, and the start of the
 * `fato_id` of the Fatos they give. */
export const TVTIME_KIND = 'tvtime'

/** Opens the Fonte: "TV Time de <Pessoa's name>". */
const ORIGIN = 'TV Time'

const RECORDS = 'tracking-prod-records.csv'
const RATINGS = /^ratings-[a-z0-9-]*votes\.csv$/
const MOVIES = 'movies.json'

const RECORD_COLUMNS = [
  'uuid',
  'type',
  'entity_type',
  'alpha_range_key',
  'release_date',
  'created_at',
  'watch_date_range_key',
] as const

/** The columns the kept copy holds: the required ones and the localized
 * title the reader prefers. */
const KEPT_RECORD_COLUMNS = [...RECORD_COLUMNS, 'movie_name'] as const
const KEPT_RATING_COLUMNS = ['uuid', 'vote_key'] as const

/** The fields of a Liberator film the reader takes. */
const KEPT_MOVIE_FIELDS = [
  'title',
  'created_at',
  'watched_at',
  'is_watched',
  'rating',
] as const

/** `vote_key`'s levels (bad, ok, good, great, wow), as TV Time's rating set
 * numbers them, on the Notas' 1 to 5. */
const LEVELS: Readonly<Record<string, number>> = {
  '1': 1,
  '27': 2,
  '28': 3,
  '29': 4,
  '3': 5,
}

const TCONST = /^tt[0-9]+$/
const DAY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/

const invalid = (message: string) => engineError('invalid_file', message)

const baseName = (path: string): string => path.split('/').at(-1) ?? path

/** A calendar day written as `YYYY-MM-DD`. */
const isDay = (text: string): boolean => {
  if (!DAY.test(text)) return false
  const date = new Date(`${text}T00:00:00Z`)
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text
  )
}

/** The day a timestamp starts with (`2025-03-08 21:00:00`,
 * `2025-03-08T21:00:00Z`); null when it does not. */
const dayOf = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const day = pyStrip(value).slice(0, 10)
  return isDay(day) ? day : null
}

/** `watch-date-<epoch>`, in seconds (or milliseconds), as a UTC day. */
const epochDay = (key: string): string | null => {
  const digits = /^watch-date-([0-9]+)$/.exec(pyStrip(key))?.[1]
  if (digits === undefined) return null
  const epoch = Number(digits)
  const date = new Date(epoch < 1e11 ? epoch * 1000 : epoch)
  return Number.isNaN(date.getTime()) ? null : dayOf(date.toISOString())
}

/** A title without case, accents or punctuation, as the resolution
 * compares them. */
const titleKey = (title: string): string =>
  Array.from(casefold(title).normalize('NFKD'))
    .filter((char) => isalnum(char))
    .join('')

/** The film's name for the resolution: TV Time's own when it is the
 * English slug's (the slug only drops case and punctuation); otherwise,
 * as for a title localized to Korean, the slug's words. */
const filmName = (alphaKey: string, localized: string): string => {
  const slug = pyStrip(alphaKey).replace(/^[a-z]+-alpha-/, '')
  const words = slug.split('-').filter(Boolean).join(' ')
  if (words === '') return localized
  return localized !== '' && titleKey(localized) === titleKey(words)
    ? localized
    : words
}

/** The year `release_date` starts with; null for TV Time's `0001-01-01`. */
const releaseYear = (value: string): number | null => {
  const year = Number(/^([0-9]{4})-/.exec(pyStrip(value))?.[1])
  return Number.isInteger(year) && year >= 1870 ? year : null
}

interface Watch {
  readonly name: string
  readonly year: number | null
  readonly imdb: string | null
  /** The days she watched it, in the file's order. */
  readonly watched: string[]
  /** The day she put it on the list, when she did. */
  listed: string | null
  /** On the Notas' 1 to 5. */
  rating: number | null
}

const rowsOf = (films: Iterable<Watch>): LetterboxdRow[] =>
  [...films].flatMap((film) => {
    const base = {
      name: film.name,
      year: film.year,
      review: null,
      tags: [],
      tmdb: null,
      origin: ORIGIN,
      factKind: TVTIME_KIND,
      imdb: film.imdb,
    } as const
    const latest = film.watched.reduce<string | null>(
      (last, day) => (last === null || day > last ? day : last),
      null,
    )
    const rows: LetterboxdRow[] = film.watched.map((day) => ({
      ...base,
      file: 'diary',
      date: day,
      watchedOn: day,
      rating: day === latest ? film.rating : null,
    }))
    if (film.listed !== null)
      rows.push({
        ...base,
        file: 'watchlist',
        date: film.listed,
        watchedOn: null,
        rating: null,
      })
    return rows
  })

const csvText = (zip: Zip, path: string, name: string): string => {
  const decoded = pyDecodeUtf8(zip.read(path), true)
  if (decoded.error !== undefined)
    throw invalid(`${name}: ${baseName(path)} não está em UTF-8`)
  return decoded.text
}

/** The ratings of the GDPR export's ratings files, by `uuid`. */
const gdprRatings = (
  zip: Zip,
  paths: readonly string[],
  name: string,
): Map<string, number> => {
  const ratings = new Map<string, number>()
  for (const path of paths) {
    const reader = new CsvDictReader(csvText(zip, path, name))
    const columns = new Set(reader.fieldnames ?? [])
    if (!columns.has('uuid') || !columns.has('vote_key'))
      throw invalid(`${name}: ${baseName(path)} sem as colunas uuid e vote_key`)
    for (const { row } of reader.rows()) {
      if (pyStrip(row.get('episode_id') ?? '') !== '') continue
      const uuid = pyStrip(row.get('uuid') ?? '')
      const level = /^stars_wording_scalev2-([0-9]+)$/.exec(
        pyStrip(row.get('vote_key') ?? ''),
      )?.[1]
      const rating = level === undefined ? undefined : LEVELS[level]
      if (uuid !== '' && rating !== undefined) ratings.set(uuid, rating)
    }
  }
  return ratings
}

const readGdpr = (
  zip: Zip,
  records: string,
  ratingFiles: readonly string[],
  name: string,
): LetterboxdRow[] => {
  const reader = new CsvDictReader(csvText(zip, records, name))
  const columns = new Set(reader.fieldnames ?? [])
  if (RECORD_COLUMNS.some((column) => !columns.has(column)))
    throw invalid(
      `${name}: ${RECORDS} sem as colunas ${RECORD_COLUMNS.slice(0, -1).join(', ')} e ${RECORD_COLUMNS.at(-1)}`,
    )
  const films = new Map<string, Watch>()
  for (const { row } of reader.rows()) {
    const get = (column: string) => pyStrip(row.get(column) ?? '')
    const type = get('type')
    if (get('entity_type') !== 'movie') continue
    if (type !== 'watch' && type !== 'rewatch' && type !== 'towatch') continue
    const uuid = get('uuid')
    const title = filmName(get('alpha_range_key'), get('movie_name'))
    const day =
      epochDay(get('watch_date_range_key')) ?? dayOf(get('created_at'))
    if (uuid === '' || title === '' || day === null) continue
    let film = films.get(uuid)
    if (film === undefined) {
      film = {
        name: title,
        year: releaseYear(get('release_date')),
        imdb: null,
        watched: [],
        listed: null,
        rating: null,
      }
      films.set(uuid, film)
    }
    if (type === 'towatch') film.listed = day
    else film.watched.push(day)
  }
  for (const [uuid, rating] of gdprRatings(zip, ratingFiles, name)) {
    const film = films.get(uuid)
    if (film !== undefined) film.rating = rating
  }
  return rowsOf(films.values())
}

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined

const readLiberator = (
  zip: Zip,
  movies: string,
  name: string,
): LetterboxdRow[] => {
  let entries: unknown
  try {
    entries = JSON.parse(csvText(zip, movies, name))
  } catch (error) {
    if (error instanceof SyntaxError)
      throw invalid(`${name}: ${MOVIES} não é um JSON válido`)
    throw error
  }
  if (!Array.isArray(entries))
    throw invalid(`${name}: ${MOVIES} não é uma lista de filmes`)
  const films: Watch[] = []
  for (const entry of entries) {
    const imdb = field(field(entry, 'id'), 'imdb')
    const title = field(entry, 'title')
    const added = dayOf(field(entry, 'created_at'))
    const rating = field(entry, 'rating')
    const film: Watch = {
      name: typeof title === 'string' ? pyStrip(title) : '',
      year: null,
      imdb: typeof imdb === 'string' && TCONST.test(imdb) ? imdb : null,
      watched: [],
      listed: null,
      rating:
        typeof rating === 'number' &&
        Number.isInteger(rating) &&
        rating >= 1 &&
        rating <= 10
          ? rating / 2
          : null,
    }
    if (film.name === '' && film.imdb === null) continue
    if (field(entry, 'is_watched') === true) {
      const day = dayOf(field(entry, 'watched_at')) ?? added
      if (day !== null) film.watched.push(day)
    } else film.listed = added
    if (film.watched.length > 0 || film.listed !== null) films.push(film)
  }
  return rowsOf(films)
}

/** The members the reader opens, in the ZIP's order; null when it has
 * neither backup. The GDPR export wins over a stray `movies.json`. */
const backupMembers = (
  zip: Zip,
):
  | {
      readonly kind: 'gdpr'
      readonly records: string
      readonly ratings: string[]
    }
  | { readonly kind: 'liberator'; readonly movies: string }
  | null => {
  const names = zip.names().filter((path) => !path.endsWith('/'))
  const records = names.find((path) => baseName(path) === RECORDS)
  if (records !== undefined)
    return {
      kind: 'gdpr',
      records,
      ratings: names.filter((path) => RATINGS.test(baseName(path))),
    }
  const movies = names.find((path) => baseName(path) === MOVIES)
  return movies === undefined ? null : { kind: 'liberator', movies }
}

/** The backup as a ZIP: the Liberator's `movies.json` sent alone (the MCP
 * takes only that, so the GDPR export never goes through the chat) is put
 * in one; a ZIP is as it came. */
export const tvTimeZip = (name: string, content: Uint8Array): Uint8Array =>
  name.toLowerCase().endsWith('.json')
    ? zipStored([{ name: MOVIES, content }])
    : content

/** Whether a ZIP's names are a TV Time backup's: the import page's one file
 * field takes it too (#163). */
export const isTvTimeBackup = (names: readonly string[]): boolean =>
  names.some((path) => {
    const base = baseName(path)
    return base === RECORDS || base === MOVIES
  })

/** Runs `f` on the ZIP, turning a bad ZIP or CSV into `invalid_file`. */
const withZip = <A>(
  name: string,
  content: Uint8Array,
  f: (zip: Zip) => A,
): A => {
  try {
    return f(new Zip(Buffer.from(content)))
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

const noBackup = (name: string) =>
  invalid(
    `${name}: o ZIP não tem o ${RECORDS} do export do TV Time nem o ${MOVIES} do TV Time Liberator`,
  )

/** The rows of a TV Time backup: `name` is the file's name, for the
 * messages. A file that breaks the format throws `invalid_file`. */
export const readTvTimeBackup = (
  name: string,
  content: Uint8Array,
): LetterboxdRow[] =>
  withZip(name, content, (zip) => {
    const members = backupMembers(zip)
    if (members === null) throw noBackup(name)
    return members.kind === 'gdpr'
      ? readGdpr(zip, members.records, members.ratings, name)
      : readLiberator(zip, members.movies, name)
  })

/** A CSV member with only `columns` and the rows `keep` takes. */
const keptCsv = (
  zip: Zip,
  path: string,
  name: string,
  columns: readonly string[],
  keep: (get: (column: string) => string) => boolean,
): Uint8Array => {
  const reader = new CsvDictReader(csvText(zip, path, name))
  let text = csvRow(columns)
  for (const { row } of reader.rows()) {
    const get = (column: string) => row.get(column) ?? ''
    if (keep((column) => pyStrip(get(column)))) text += csvRow(columns.map(get))
  }
  return Buffer.from(text, 'utf8')
}

/** The GDPR export's film rows, and the ratings of those films. */
const keptGdpr = (
  zip: Zip,
  records: string,
  ratings: readonly string[],
  name: string,
) => {
  const films = new Set<string>()
  const members = [
    {
      name: records,
      content: keptCsv(zip, records, name, KEPT_RECORD_COLUMNS, (get) => {
        if (get('entity_type') !== 'movie') return false
        films.add(get('uuid'))
        return true
      }),
    },
  ]
  for (const path of ratings)
    members.push({
      name: path,
      content: keptCsv(
        zip,
        path,
        name,
        KEPT_RATING_COLUMNS,
        (get) => get('episode_id') === '' && films.has(get('uuid')),
      ),
    })
  return members
}

/** The Liberator's films with the IMDb id and the fields the reader takes. */
const keptLiberator = (zip: Zip, movies: string, name: string) => {
  const entries: unknown = JSON.parse(csvText(zip, movies, name))
  const kept = (Array.isArray(entries) ? entries : []).map((entry) => {
    const imdb = field(field(entry, 'id'), 'imdb')
    return {
      ...(imdb !== undefined && { id: { imdb } }),
      ...Object.fromEntries(
        KEPT_MOVIE_FIELDS.filter((key) => field(entry, key) !== undefined).map(
          (key) => [key, field(entry, key)],
        ),
      ),
    }
  })
  return [
    {
      name: movies,
      content: Buffer.from(`${JSON.stringify(kept, null, 2)}\n`, 'utf8'),
    },
  ]
}

/** The copy the import keeps: a ZIP with only the members the reader opens,
 * and of them only the films and what the reader takes. Credentials, series,
 * episodes and the account's ids never reach filmes-dados. Call it after
 * `readTvTimeBackup`, which reports a bad file. */
export const keptTvTimeBackup = (
  name: string,
  content: Uint8Array,
): Uint8Array =>
  withZip(name, content, (zip) => {
    const members = backupMembers(zip)
    if (members === null) throw noBackup(name)
    const order = zip.names()
    return zipStored(
      (members.kind === 'gdpr'
        ? keptGdpr(zip, members.records, members.ratings, name)
        : keptLiberator(zip, members.movies, name)
      ).sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name)),
    )
  })
