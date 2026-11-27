// A Pessoa's imports as a screen shows them (#117): the files she has
// imported, what her Letterboxd films became (resolved, discarded, queued)
// and how many Trakt and IMDb Fatos she has. Read only. Python had no such command:
// `importar` printed the report once, after an import.
import { Effect } from 'effect'
import { isMapping, pyStrValue, type YamlValue } from '../data/yaml.ts'
import { resolvePerson } from '../people/people.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import { Sqlite, type SqliteError } from '../sqlite/Sqlite.ts'
import { imdbFactCounts, type ImdbFactCounts } from './imdb.ts'
import { letterboxdReport, type LetterboxdReport } from './letterboxd.ts'
import {
  requireImportTables,
  traktFactCounts,
  type TraktFactCounts,
} from './trakt.ts'

/** An import recorded in the Pessoa's file. */
export interface ImportRecord {
  /** `letterboxd`, `letterboxd-rss`, `trakt` or `imdb`. */
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
}

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
        }
      }),
    )
  })
