// The films of a Simkl backup (#299): `SimklBackup.json`, alone or in the
// `SimklBackup.zip` Simkl's export gives (Apps › Export › ".zip archive
// with .json file"). It has the shape of Simkl's `/sync/all-items`: the
// films in `movies` (each under `movie`), shows in `shows` and anime in
// `anime` (each under `show`, the films with `anime_type: "movie"`). Shows,
// episodes and anime series are left out: filmes is about films.
//
// Each entry carries the film's ids, the Pessoa's `status` and, when she
// rated it, `user_rating` on Simkl's 1 to 10. A rated film is a Nota; a
// `completed` one without a rating is a Já visto; a `plantowatch` one is on
// her watchlist. The day is `last_watched_at`, then `user_rated_at`, then
// `added_to_watchlist_at`; Simkl writes `1970-01-01T00:00:01Z` for "I don't
// remember", which is no day.
import { pyIsoInstantUtc } from '../compat/datetime.ts'
import { engineError } from '../runtime/EngineError.ts'
import { posixName } from './trakt-export.ts'
import { Zip, ZipError } from './zip.ts'

/** The file inside Simkl's ZIP. */
const BACKUP_FILE = 'SimklBackup.json'

/** A film as the backup names it; any id may be missing. */
export interface SimklFilm {
  readonly name: string | null
  readonly year: number | null
  readonly imdb: string | null
  readonly tmdb: string | null
  readonly simkl: number | null
}

export type SimklRowKind = 'rating' | 'seen' | 'watchlist'

export interface SimklRow {
  readonly film: SimklFilm
  readonly kind: SimklRowKind
  /** On the Notas' 0.5 to 5 scale (Simkl's halved); null unless rated. */
  readonly rating: number | null
  /** `2025-03-08`, in UTC; null when the backup gives no day. */
  readonly date: string | null
}

const DATE_FIELDS = [
  'last_watched_at',
  'user_rated_at',
  'added_to_watchlist_at',
] as const

/** Simkl's "I don't remember" instant, as `pyIsoInstantUtc` gives it. */
const DONT_REMEMBER = '1970-01-01T00:00:01.000000+00:00'

const TCONST = /^tt[0-9]+$/
const TMDB_ID = /^[1-9][0-9]*$/

const invalid = (message: string) => engineError('invalid_file', message)

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

const isObject = (value: Json | undefined): value is { [key: string]: Json } =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isZip = (content: Uint8Array): boolean =>
  content[0] === 0x50 && content[1] === 0x4b

/** The JSON of the bytes, or null when they are not UTF-8 JSON. */
const parse = (content: Uint8Array): Json | null => {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(content)
  } catch {
    return null
  }
  try {
    return JSON.parse(text.replace(/^﻿/, '')) as Json
  } catch {
    return null
  }
}

/** A backup's top level: its films are in `movies` or `anime`. */
const isBackup = (json: Json | null): json is { [key: string]: Json } =>
  isObject(json) &&
  (Array.isArray(json['movies']) || Array.isArray(json['anime']))

/** The member of the ZIP that holds the backup, if any. */
const backupMember = (zip: Zip) =>
  zip
    .members()
    .find(
      (member) =>
        !member.name.endsWith('/') && posixName(member.name) === BACKUP_FILE,
    )

/** Whether the bytes are a Simkl backup: the bare JSON, or a ZIP with
 * `SimklBackup.json`. The import page's one file field takes it too (#163). */
export const isSimklBackup = (content: Uint8Array): boolean => {
  if (!isZip(content)) return isBackup(parse(content))
  try {
    return backupMember(new Zip(Buffer.from(content))) !== undefined
  } catch (error) {
    if (error instanceof ZipError) return false
    throw error
  }
}

/** The extension the kept copy takes. */
export const simklExtension = (content: Uint8Array): 'zip' | 'json' =>
  isZip(content) ? 'zip' : 'json'

const tmdbId = (value: Json | undefined): string | null => {
  const text =
    typeof value === 'string'
      ? value
      : typeof value === 'number' && Number.isSafeInteger(value)
        ? String(value)
        : null
  return text !== null && TMDB_ID.test(text) ? text : null
}

const filmOf = (data: Json | undefined): SimklFilm => {
  const film = isObject(data) ? data : {}
  const ids = isObject(film['ids']) ? film['ids'] : {}
  const { title, year } = film
  const { imdb, simkl } = ids
  return {
    name: typeof title === 'string' ? title : null,
    year: typeof year === 'number' && Number.isInteger(year) ? year : null,
    imdb: typeof imdb === 'string' && TCONST.test(imdb) ? imdb : null,
    tmdb: tmdbId(ids['tmdb']),
    simkl:
      typeof simkl === 'number' && Number.isSafeInteger(simkl) ? simkl : null,
  }
}

/** The first day of the entry's date fields; a date that does not read is
 * `invalid_file`. */
const dayOf = (
  entry: { [key: string]: Json },
  where: string,
): string | null => {
  for (const field of DATE_FIELDS) {
    const value = entry[field]
    if (value === undefined || value === null) continue
    const instant = typeof value === 'string' ? pyIsoInstantUtc(value) : null
    if (instant === null) throw invalid(`${where}: data inválida em ${field}`)
    if (instant !== DONT_REMEMBER) return instant.slice(0, 10)
  }
  return null
}

const rowOf = (
  entry: Json,
  data: Json | undefined,
  where: string,
): SimklRow | null => {
  if (!isObject(entry)) throw invalid(`${where}: era esperado um objeto`)
  const rated = entry['user_rating']
  let rating: number | null = null
  if (rated !== undefined && rated !== null) {
    if (
      typeof rated !== 'number' ||
      !Number.isInteger(rated) ||
      rated < 1 ||
      rated > 10
    )
      throw invalid(`${where}: nota fora da escala inteira de 1 a 10`)
    rating = rated / 2
  }
  const kind: SimklRowKind | null =
    rating !== null
      ? 'rating'
      : entry['status'] === 'completed'
        ? 'seen'
        : entry['status'] === 'plantowatch'
          ? 'watchlist'
          : null
  if (kind === null) return null
  return { film: filmOf(data), kind, rating, date: dayOf(entry, where) }
}

/** The films of a backup's top level, in its order: `movies`, then the
 * anime films. */
const rowsOf = (file: string, json: { [key: string]: Json }): SimklRow[] => {
  const rows: SimklRow[] = []
  const list = (key: string): Json[] => {
    const value = json[key]
    if (value === undefined || value === null) return []
    if (!Array.isArray(value))
      throw invalid(`${file}: ${key} deveria ser uma lista`)
    return value
  }
  list('movies').forEach((entry, index) => {
    const row = rowOf(
      entry,
      isObject(entry) ? entry['movie'] : undefined,
      `${file}, movies, item ${index + 1}`,
    )
    if (row !== null) rows.push(row)
  })
  list('anime').forEach((entry, index) => {
    if (!isObject(entry) || entry['anime_type'] !== 'movie') return
    const row = rowOf(
      entry,
      entry['movie'] ?? entry['show'],
      `${file}, anime, item ${index + 1}`,
    )
    if (row !== null) rows.push(row)
  })
  return rows
}

/** The films of a Simkl backup: `name` is the file's name, for the
 * messages. A file that breaks the format throws `invalid_file`. */
export const readSimklBackup = (
  name: string,
  content: Uint8Array,
): SimklRow[] => {
  let file = name
  let bytes = content
  if (isZip(content)) {
    try {
      const member = backupMember(new Zip(Buffer.from(content)))
      if (member === undefined)
        throw invalid(`${name}: ZIP sem o ${BACKUP_FILE} do Simkl`)
      file = member.name
      bytes = member.read()
    } catch (error) {
      if (
        error instanceof ZipError ||
        (error instanceof Error &&
          error.message.startsWith('NotImplementedError'))
      )
        throw invalid(`${name}: ZIP do Simkl inválido`)
      throw error
    }
  }
  const json = parse(bytes)
  if (json === null) throw invalid(`${file}: JSON do Simkl inválido`)
  if (!isBackup(json))
    throw invalid(`${file}: JSON sem movies nem anime de um backup do Simkl`)
  return rowsOf(file, json)
}
