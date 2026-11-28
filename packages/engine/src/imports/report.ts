// A Pessoa's imports as a screen shows them (#117): the files she has
// imported, what her Letterboxd films became (resolved, discarded, queued)
// and how many Trakt, IMDb, Simkl and TV Time Fatos she has. Read only. Python had no such command:
// `importar` printed the report once, after an import.
import { Effect } from 'effect'
import { isMapping, pyStrValue, type YamlValue } from '../data/yaml.ts'
import { resolvePerson } from '../people/people.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import { Sqlite, type Connection, type SqliteError } from '../sqlite/Sqlite.ts'
import { imdbFactCounts, type ImdbFactCounts } from './imdb.ts'
import {
  letterboxdReport,
  type FactCounts,
  type LetterboxdReport,
} from './letterboxd.ts'
import { simklFactCounts, type SimklFactCounts } from './simkl.ts'
import {
  requireImportTables,
  traktFactCounts,
  type TraktFactCounts,
} from './trakt.ts'
import { tvTimeFactCounts } from './tvtime.ts'

/** An import recorded in the Pessoa's file. */
export interface ImportRecord {
  /** `letterboxd`, `letterboxd-rss`, `trakt`, `imdb`, `simkl` or `tvtime`. */
  readonly kind: string
  /** The kept copy, relative to filmes-dados: `removeImport` takes it. */
  readonly file: string
  readonly date: string
  /** The uploaded file's name, or the RSS address. */
  readonly original: string
}

export interface PersonImports {
  readonly person: string
  readonly name: string
  /** In the order she imported them. */
  readonly imports: readonly ImportRecord[]
  readonly letterboxd: LetterboxdReport
  readonly trakt: TraktFactCounts
  readonly imdb: ImdbFactCounts
  readonly simkl: SimklFactCounts
  /** Her TV Time Fatos; the films that needed resolving are in
   * `letterboxd`, which holds every film of the resolution queue. */
  readonly tvtime: FactCounts
  /** What each of the other sites gave, film by film, the way the notice
   * of its import counts (#274). */
  readonly films: Readonly<Record<FilmSource, SourceFilms>>
}

/** The sites whose Fatos `films` counts by film. */
export type FilmSource = 'trakt' | 'imdb' | 'simkl' | 'tvtime'

/** A site's films (#274): with a Nota from it, seen in it without one, and
 * only on its watchlist. A rated film is not a Já visto too, though some
 * sites (the Trakt history, TV Time) write both: the Fato counts say what
 * the site holds, these what her Notas list shows. */
export interface SourceFilms {
  readonly rated: number
  readonly seen: number
  readonly watchlist: number
}

/** Her films of the source whose Fatos' ids start with `kind:`. */
const sourceFilms = (
  db: Connection,
  slug: string,
  kind: FilmSource,
): Effect.Effect<SourceFilms, SqliteError> =>
  Effect.gen(function* () {
    const prefix = `${kind}:%`
    const of = (table: string) =>
      `SELECT filme_id FROM ${table} WHERE pessoa = ? AND fato_id LIKE ?`
    const count = (sql: string, ...params: string[]) =>
      Effect.map(db.get(sql, ...params), (row) => Number(row?.n ?? 0))
    return {
      rated: yield* count(
        `SELECT count(DISTINCT filme_id) AS n FROM (${of('notas')})`,
        slug,
        prefix,
      ),
      seen: yield* count(
        `SELECT count(DISTINCT filme_id) AS n FROM (${of('ja_visto')})
         WHERE filme_id NOT IN (${of('notas')})`,
        slug,
        prefix,
        slug,
        prefix,
      ),
      watchlist: yield* count(
        `SELECT count(DISTINCT filme_id) AS n FROM (${of('watchlist')})
         WHERE filme_id NOT IN (${of('notas')})
           AND filme_id NOT IN (${of('ja_visto')})`,
        slug,
        prefix,
        slug,
        prefix,
        slug,
        prefix,
      ),
    }
  })

const field = (record: ReadonlyMap<string, YamlValue>, key: string) => {
  const value = record.get(key)
  return value === undefined || value === null ? '' : pyStrValue(value)
}

/** The Pessoa's imports and what they gave. */
export const personImports = (
  name: string,
): Effect.Effect<
  PersonImports,
  EngineError | SqliteError,
  Environment | Sqlite
> =>
  Effect.gen(function* () {
    const person = yield* resolvePerson(name)
    const imports = person.imports.filter(isMapping).map((record) => ({
      kind: field(record, 'kind'),
      file: field(record, 'file'),
      date: field(record, 'date'),
      original: field(record, 'original'),
    }))
    return yield* (yield* Sqlite).read((db) =>
      Effect.gen(function* () {
        yield* requireImportTables(db)
        return {
          person: person.slug,
          name: person.name,
          imports,
          letterboxd: yield* letterboxdReport(db, person.slug),
          trakt: yield* traktFactCounts(db, person.slug),
          imdb: yield* imdbFactCounts(db, person.slug),
          simkl: yield* simklFactCounts(db, person.slug),
          tvtime: yield* tvTimeFactCounts(db, person.slug),
          films: {
            trakt: yield* sourceFilms(db, person.slug, 'trakt'),
            imdb: yield* sourceFilms(db, person.slug, 'imdb'),
            simkl: yield* sourceFilms(db, person.slug, 'simkl'),
            tvtime: yield* sourceFilms(db, person.slug, 'tvtime'),
          },
        }
      }),
    )
  })
