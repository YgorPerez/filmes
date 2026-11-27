// The TV Time import (#300): a Pessoa's backup, the GDPR export or the TV
// Time Liberator's (`tvtime-backup.ts`). Its films go through the
// Letterboxd import's loader: a GDPR film resolves by title and year
// through the same chain and waits in the same queue, so the Dono's
// decision on a film is one for every Pessoa and either import; a
// Liberator film names its tconst and loads when the Catálogo has it.
//
// The Fatos have a `tvtime:...` fato_id and Fonte "TV Time de <name>":
// Já visto for each watch, Nota for the rating (on the latest watch, read
// on the Pessoa's Escala like any Nota) and the watchlist. The kept copy
// holds only the film files. The Letterboxd loader redoes them with its
// own, so the rebuild and the app's reload need no step of their own.
import { basename } from 'node:path'
import { Effect } from 'effect'
import { DataWriter, type Author } from '../data/DataWriter.ts'
import type { GitError } from '../data/git.ts'
import { resolvePerson } from '../people/people.ts'
import type { Person } from '../people/Person.ts'
import { EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import { Run } from '../runtime/Run.ts'
import type { Connection, Sqlite, SqliteError } from '../sqlite/Sqlite.ts'
import { TMDB_ATTRIBUTION, type Tmdb } from '../sources/Tmdb.ts'
import {
  countFacts,
  ensureLetterboxdTables,
  inCatalogue,
  letterboxdReport,
  loadLetterboxd,
  recordTmdbAnswers,
  type FactCounts,
  type LetterboxdReport,
} from './letterboxd.ts'
import { rowKey, type LetterboxdRow } from './letterboxd-export.ts'
import { storedImports, storeImport } from './stored.ts'
import {
  keptTvTimeBackup,
  readTvTimeBackup,
  TVTIME_KIND,
  tvTimeZip,
} from './tvtime-backup.ts'

/** Runs a reader that throws the `EngineError` of a bad file. */
const attempt = <A>(f: () => A): Effect.Effect<A, EngineError> =>
  Effect.suspend(() => {
    try {
      return Effect.succeed(f())
    } catch (error) {
      if (error instanceof EngineError) return Effect.fail(error)
      throw error
    }
  })

/** The rows of every backup the Pessoa has stored, in record order. */
const personTvTimeRows = (
  person: Person,
): Effect.Effect<LetterboxdRow[], EngineError, Environment> =>
  Effect.map(
    storedImports(person, TVTIME_KIND, (path, content) =>
      attempt(() => readTvTimeBackup(basename(path), content)),
    ),
    (files) => files.flat(),
  )

/** A film named by its tconst that the Catálogo does not have. */
export interface TvTimeOutside {
  readonly film: string
  readonly title: string | null
}

const outsideCatalog = (
  db: Connection,
  rows: readonly LetterboxdRow[],
): Effect.Effect<TvTimeOutside[], SqliteError> =>
  Effect.gen(function* () {
    const outside = new Map<string, TvTimeOutside>()
    for (const row of rows)
      if (
        row.imdb &&
        !outside.has(row.imdb) &&
        !(yield* inCatalogue(db, row.imdb))
      )
        outside.set(row.imdb, { film: row.imdb, title: row.name || null })
    return [...outside.values()]
  })

export const tvTimeFactCounts = (
  db: Connection,
  slug: string,
): Effect.Effect<FactCounts, SqliteError> => countFacts(db, slug, TVTIME_KIND)

/** What the Pessoa's TV Time films became: the resolution report of those
 * the chain took, and the Fatos. */
export interface TvTimeImport extends LetterboxdReport {
  /** The kept copy, relative to filmes-dados. */
  readonly file: string
  /** False when the same backup had been imported before. */
  readonly newFile: boolean
  readonly facts: FactCounts
  readonly newFacts: FactCounts
  /** Films named by a tconst the Catálogo does not have, from all her
   * backups. */
  readonly outsideCatalog: readonly TvTimeOutside[]
  readonly warnings: readonly string[]
  readonly attributions: readonly (typeof TMDB_ATTRIBUTION)[]
}

export interface TvTimeImportInput {
  /** Slug, name or alias; "dono" is the Dono. */
  readonly person: string
  /** The file's name as uploaded: the messages and the record show it. */
  readonly original: string
  /** The ZIP's bytes, or the Liberator's `movies.json` when `original`
   * ends in `.json`. */
  readonly content: Uint8Array
  /** Who asked: the commit's author. */
  readonly author: Author
}

/** Imports a Pessoa's TV Time backup: keeps its film files, asks TMDB for
 * what Wikidata did not resolve, and reloads the import Fatos. */
export const importTvTime = (
  input: TvTimeImportInput,
): Effect.Effect<
  TvTimeImport,
  EngineError | SqliteError | GitError,
  Environment | Sqlite | Run | Tmdb | DataWriter
> =>
  Effect.gen(function* () {
    const zip = tvTimeZip(input.original, input.content)
    const rows = yield* attempt(() => readTvTimeBackup(input.original, zip))
    const kept = yield* attempt(() => keptTvTimeBackup(input.original, zip))
    const writer = yield* DataWriter
    return yield* writer.write(
      {
        author: input.author,
        message: `import ${TVTIME_KIND} ${input.person}: ${input.original}`,
      },
      (db) =>
        Effect.gen(function* () {
          yield* ensureLetterboxdTables(db)
          const person = yield* resolvePerson(input.person)
          const before = yield* tvTimeFactCounts(db, person.slug)
          const all = [...(yield* personTvTimeRows(person)), ...rows]
          const { resolutions, usedTmdb } = yield* recordTmdbAnswers(db, all)
          const stored = yield* storeImport(
            person,
            TVTIME_KIND,
            input.original,
            kept,
            'zip',
          )
          yield* loadLetterboxd(db, resolutions)
          const after = yield* tvTimeFactCounts(db, person.slug)
          const ids = new Set(all.filter((r) => !r.imdb).map(rowKey))
          const report = yield* letterboxdReport(db, person.slug, ids)
          return {
            ...report,
            file: stored.file,
            newFile: stored.new,
            facts: after,
            newFacts: Object.fromEntries(
              Object.entries(after).map(([k, n]) => [
                k,
                n - before[k as keyof FactCounts],
              ]),
            ) as FactCounts,
            outsideCatalog: yield* outsideCatalog(db, all),
            warnings: yield* (yield* Run).warnings,
            attributions:
              usedTmdb || report.resolved.tmdb > 0 ? [TMDB_ATTRIBUTION] : [],
          }
        }),
    )
  })
