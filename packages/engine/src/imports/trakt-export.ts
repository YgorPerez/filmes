// The movies of a Trakt Raw Export (`importar/zip_trakt.py`): the ratings,
// the history and the watchlist JSONs of the ZIP, each item a film with its
// ids, the instant (in UTC) and, for a rating, the Nota on the 0.5 to 5
// scale. The watchlist is `watchlist.json` (`lists/watchlist.json` in some
// exports) or `lists-watchlist.json`, its items dated by `listed_at`, as
// the API's watchlist gives them (#280).
import { pyIsoInstantUtc } from '../compat/datetime.ts'
import { engineError } from '../runtime/EngineError.ts'
import { pyJsonLoads, type PyJson } from './py-json.ts'
import { Zip, ZipError } from './zip.ts'

/** A film as the export names it; any id may be missing. */
export interface TraktFilm {
  readonly name: string | null
  readonly imdb: string | null
  readonly tmdb: string | null
  /** An int in Python, of any size. */
  readonly trakt: bigint | null
}

export interface TraktRow {
  readonly film: TraktFilm
  /** `2025-02-03T19:00:00.000000+00:00`. */
  readonly instant: string
  readonly rating: number | null
  /** On the watchlist, not seen (#280). */
  readonly watchlist: boolean
}

// Python's `\d` is any decimal digit.
const FILE =
  /^(ratings(?:-movies)?|(?:watched-)?history|watched-movies|(?:lists-)?watchlist(?:-movies)?)(?:-\p{Nd}+)?\.json$/u

type DateField = 'rated_at' | 'watched_at' | 'last_watched_at' | 'listed_at'

const DATE_FIELDS: Readonly<Record<string, DateField>> = {
  ratings: 'rated_at',
  'ratings-movies': 'rated_at',
  history: 'watched_at',
  'watched-history': 'watched_at',
  'watched-movies': 'last_watched_at',
  watchlist: 'listed_at',
  'watchlist-movies': 'listed_at',
  'lists-watchlist': 'listed_at',
  'lists-watchlist-movies': 'listed_at',
}

/** `PurePosixPath(path).name`. */
export const posixName = (path: string): string =>
  path
    .split('/')
    .filter((part) => part !== '' && part !== '.')
    .at(-1) ?? ''

/** A member the Trakt reader takes: a ratings or history JSON. */
export const isTraktFile = (path: string): boolean =>
  !path.endsWith('/') && FILE.test(posixName(path))

const invalid = (message: string) => engineError('invalid_file', message)

const isObject = (value: PyJson | undefined): value is Map<string, PyJson> =>
  value instanceof Map

/** `str(value)` matching `[1-9][0-9]*`: a str as it is, or a positive int
 * (a float's repr always has a "." or an "e"). */
const tmdbId = (value: PyJson | undefined): string | null => {
  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'bigint'
        ? String(value)
        : null
  return text !== null && /^[1-9][0-9]*$/.test(text) ? text : null
}

const rowsOf = (
  content: Buffer,
  file: string,
  field: DateField,
): TraktRow[] => {
  const loaded = pyJsonLoads(content)
  if (loaded === null) throw invalid(`${file}: JSON inválido`)
  if (!Array.isArray(loaded.value))
    throw invalid(`${file}: o JSON deve conter uma lista`)
  const rows: TraktRow[] = []
  loaded.value.forEach((item, index) => {
    const where = `${file}, item ${index + 1}`
    if (!isObject(item)) throw invalid(`${where}: era esperado um objeto`)
    const kind = item.get('type')
    if (kind !== undefined && kind !== null && kind !== 'movie') return
    let data = item.get('movie')
    if (!isObject(data)) {
      if (!item.has('movie') && kind !== 'movie') return
      // A film removed from Trakt may come without its metadata.
      data = new Map()
    }
    const found = data.get('ids')
    const ids = isObject(found) ? found : new Map<string, PyJson>()
    const imdb = ids.get('imdb')
    const title = data.get('title')
    const trakt = ids.get('trakt')
    const film: TraktFilm = {
      name: typeof title === 'string' ? title : null,
      imdb: typeof imdb === 'string' && /^tt[0-9]+$/.test(imdb) ? imdb : null,
      tmdb: tmdbId(ids.get('tmdb')),
      trakt: typeof trakt === 'bigint' ? trakt : null,
    }
    let rating: number | null = null
    if (field === 'rated_at') {
      const value = item.get('rating')
      if (typeof value !== 'bigint' || value < 1n || value > 10n)
        throw invalid(`${where}: nota fora da escala inteira de 1 a 10`)
      rating = Number(value) / 2
    }
    const at = item.get(field)
    const instant = typeof at === 'string' ? pyIsoInstantUtc(at) : null
    if (instant === null) throw invalid(`${where}: data inválida em ${field}`)
    rows.push({ film, instant, rating, watchlist: field === 'listed_at' })
  })
  return rows
}

/** The members the reader takes, each with its date field. */
const traktFiles = (content: Uint8Array) =>
  new Zip(Buffer.from(content)).members().flatMap((member) => {
    const match = FILE.exec(posixName(member.name))
    return match !== null && !member.name.endsWith('/')
      ? [{ member, field: DATE_FIELDS[match[1] ?? ''] ?? 'rated_at' }]
      : []
  })

/** Whether a Trakt export that reads has a watchlist file, even an empty
 * one. */
export const hasTraktWatchlist = (content: Uint8Array): boolean =>
  traktFiles(content).some(({ field }) => field === 'listed_at')

/** The rows of a Trakt export (`zip_trakt.ler`): `name` is the file's name,
 * for the messages. The watched-movies summary counts only when the export
 * has no history. Throws the `EngineError` Python raised. */
export const readTraktExport = (
  name: string,
  content: Uint8Array,
): TraktRow[] => {
  try {
    const files = traktFiles(content)
    if (files.length === 0)
      throw invalid(`${name}: ZIP sem notas ou histórico do Trakt`)
    const history = files.some(({ field }) => field === 'watched_at')
    return files
      .filter(({ field }) => !(history && field === 'last_watched_at'))
      .flatMap(({ member, field }) => rowsOf(member.read(), member.name, field))
  } catch (error) {
    if (error instanceof ZipError)
      throw invalid(`${name}: ZIP do Trakt inválido`)
    if (
      error instanceof Error &&
      error.message.startsWith('NotImplementedError')
    )
      throw invalid(`${name}: ZIP do Trakt inválido`)
    throw error
  }
}

/** A Trakt profile read by the API (#269), as filmes-dados keeps it: the
 * lists the Raw Export's JSONs hold, under one object. */
export interface TraktSnapshot {
  /** `me` for the connected account, or the public username. */
  readonly user: string
  readonly history: ReadonlyArray<unknown>
  readonly ratings: ReadonlyArray<unknown>
  readonly watchlist: ReadonlyArray<unknown>
}

/** The rows of a kept snapshot (`readTraktExport`'s, for the API's lists):
 * the history, the ratings and the watchlist, read as the export's files. */
export const readTraktSnapshot = (
  name: string,
  content: Uint8Array,
): TraktRow[] => {
  let snapshot: unknown
  try {
    snapshot = JSON.parse(Buffer.from(content).toString('utf8'))
  } catch {
    throw invalid(`${name}: JSON inválido`)
  }
  if (typeof snapshot !== 'object' || snapshot === null)
    throw invalid(`${name}: o JSON deve conter um objeto`)
  const lists = snapshot as Record<string, unknown>
  const read = (key: string, field: DateField) =>
    rowsOf(
      Buffer.from(JSON.stringify(lists[key] ?? [])),
      `${name}: ${key}`,
      field,
    )
  return [
    ...read('history', 'watched_at'),
    ...read('ratings', 'rated_at'),
    ...read('watchlist', 'listed_at'),
  ]
}
