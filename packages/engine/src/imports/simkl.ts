// The Simkl import (#299): a Pessoa's Simkl backup (`simkl-backup.ts`).
// A film resolves by its ids (`film-ids.ts`: the IMDb id, then the TMDB id
// through Letterboxd's slugs and Wikidata) and, when those leave it out,
// by the tconst TMDB gives its TMDB id. `importSimkl` asks TMDB for the
// films of the new backup and records the answers in that backup's import
// record (`tmdb:`, TMDB id to tconst), so a rebuild reads them offline.
// What resolves to no film of the Catálogo is reported, not queued.
//
// Fatos have a `simkl:...` fato_id and Fonte "Simkl de <name>". A film the
// backup gives no day keeps the day of the import record. Every change
// reloads the Pessoa's Simkl Fatos from all her stored backups; the
// watchlist is the latest backup's.
import { basename } from 'node:path'
import { Effect } from 'effect'
import { factId, pyFloat } from '../compat/fact-id.ts'
import { DataWriter, type Author } from '../data/DataWriter.ts'
import type { GitError } from '../data/git.ts'
import {
  isMapping,
  pyStrValue,
  type YamlMapping,
  type YamlValue,
} from '../data/yaml.ts'
import { readPeople, resolvePerson, savePerson } from '../people/people.ts'
import type { Person } from '../people/Person.ts'
import type { Attribution } from '../recommendation/attributions.ts'
import { EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import { Run } from '../runtime/Run.ts'
import { TMDB_ATTRIBUTION, Tmdb } from '../sources/Tmdb.ts'
import { Sqlite, type Connection, type SqliteError } from '../sqlite/Sqlite.ts'
import {
  hasWikidata,
  inCatalog,
  resolveFilmIds,
  type ResolvedBy,
} from './film-ids.ts'
import {
  readSimklBackup,
  simklExtension,
  type SimklFilm,
  type SimklRow,
} from './simkl-backup.ts'
import { storedImports, storeImport } from './stored.ts'
import { requireImportTables } from './trakt.ts'
import { withLatestWatchlist } from './watchlist.ts'

/** The kind of a Pessoa's `imports:` records this module reads. */
export const SIMKL_KIND = 'simkl'

/** The import record's field with TMDB's answers. */
const TMDB_FIELD = 'tmdb'

const FACT_TABLES = ['notas', 'ja_visto', 'watchlist'] as const

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

/** A row with its day: the backup's, or the import record's. */
interface DatedRow extends SimklRow {
  readonly date: string
}

/** What the Pessoa's stored backups give: their rows and TMDB's answers. */
interface PersonBackups {
  readonly rows: readonly DatedRow[]
  /** TMDB id to tconst. */
  readonly answers: ReadonlyMap<string, string>
}

const simklRecords = (person: Person): YamlMapping[] =>
  person.imports.filter(
    (record): record is YamlMapping =>
      isMapping(record) && record.get('kind') === SIMKL_KIND,
  )

const answersOf = (record: YamlMapping): [string, string][] => {
  const answers = record.get(TMDB_FIELD)
  return isMapping(answers)
    ? [...answers].map(([tmdb, tconst]) => [tmdb, pyStrValue(tconst)])
    : []
}

/** The rows of every backup the Pessoa has stored, in record order, and
 * the TMDB answers their records keep. */
const personSimklBackups = (
  person: Person,
): Effect.Effect<PersonBackups, EngineError, Environment> =>
  Effect.gen(function* () {
    const records = simklRecords(person)
    const backups = yield* storedImports(person, SIMKL_KIND, (path, content) =>
      attempt(() => readSimklBackup(basename(path), content)),
    )
    const dated = backups.map((rows, index) => {
      const record = records[index]
      const day = pyStrValue(record?.get('date') ?? null)
      return {
        rows: rows.map((row): DatedRow => ({ ...row, date: row.date ?? day })),
        // Each backup holds her whole watchlist of its day.
        hasWatchlist: true,
      }
    })
    return {
      rows: withLatestWatchlist(dated, (row) => row.kind === 'watchlist'),
      answers: new Map(records.flatMap(answersOf)),
    }
  })

type Resolution = readonly [string, ResolvedBy] | null

/** The film's tconst: by its ids, then by TMDB's recorded answer. */
const resolveFilm = (
  db: Connection,
  film: SimklFilm,
  wikidata: boolean,
  answers: ReadonlyMap<string, string>,
): Effect.Effect<Resolution, SqliteError> =>
  Effect.gen(function* () {
    const found = yield* resolveFilmIds(db, film, wikidata)
    if (found !== null || film.tmdb === null) return found
    const answered = answers.get(film.tmdb)
    return answered !== undefined && (yield* inCatalog(db, answered))
      ? ([answered, 'tmdb'] as const)
      : null
  })

const insertFact = (
  db: Connection,
  slug: string,
  source: string,
  film: string,
  row: DatedRow,
): Effect.Effect<unknown, SqliteError> => {
  switch (row.kind) {
    case 'watchlist':
      return db.run(
        `INSERT INTO watchlist (fato_id, pessoa, filme_id, fonte, data)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT(fato_id) DO NOTHING`,
        factId(SIMKL_KIND, 'watchlist', slug, film, row.date),
        slug,
        film,
        source,
        row.date,
      )
    case 'seen':
      return db.run(
        `INSERT INTO ja_visto (fato_id, pessoa, filme_id, fonte, data, tipo)
         VALUES (?, ?, ?, ?, ?, 'declarado') ON CONFLICT(fato_id) DO NOTHING`,
        factId(SIMKL_KIND, 'ja_visto', slug, film, row.date),
        slug,
        film,
        source,
        row.date,
      )
    case 'rating':
      return db.run(
        `INSERT INTO notas (fato_id, pessoa, filme_id, fonte, data, nota)
         VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(fato_id) DO NOTHING`,
        factId(
          SIMKL_KIND,
          'notas',
          slug,
          film,
          row.date,
          pyFloat(row.rating ?? 0),
        ),
        slug,
        film,
        source,
        row.date,
        row.rating,
      )
  }
}

/** A film the Catálogo could not resolve, as the report shows it. */
export type SimklUnresolved = SimklFilm

export interface SimklReport {
  /** Films resolved by each id; a film some backup gave by its IMDb id
   * counts there only. */
  readonly resolved: Readonly<Record<ResolvedBy, number>>
  readonly unresolved: readonly SimklUnresolved[]
}

/** Replaces the Pessoa's Simkl Fatos by those of the backups. */
const loadPerson = (
  db: Connection,
  person: Person,
  { rows, answers }: PersonBackups,
): Effect.Effect<SimklReport, SqliteError> =>
  Effect.gen(function* () {
    for (const table of FACT_TABLES)
      yield* db.run(
        `DELETE FROM ${table} WHERE pessoa = ? AND fato_id LIKE 'simkl:%'`,
        person.slug,
      )
    const wikidata = yield* hasWikidata(db)
    const source = `Simkl de ${person.name}`
    const resolutions = new Map<string, Resolution>()
    const resolved = { imdb: new Set<string>(), tmdb: new Set<string>() }
    const unresolved: SimklUnresolved[] = []
    for (const row of rows) {
      const { film } = row
      const key = JSON.stringify(film)
      let found = resolutions.get(key)
      if (found === undefined) {
        found = yield* resolveFilm(db, film, wikidata, answers)
        resolutions.set(key, found)
        if (found === null) unresolved.push(film)
      }
      if (found === null) continue
      const [id, by] = found
      resolved[by].add(id)
      yield* insertFact(db, person.slug, source, id, row)
    }
    for (const id of resolved.imdb) resolved.tmdb.delete(id)
    return {
      resolved: { imdb: resolved.imdb.size, tmdb: resolved.tmdb.size },
      unresolved,
    }
  })

/** Redoes every Pessoa's Simkl Fatos: the rebuild. */
export const loadSimkl = (
  db: Connection,
): Effect.Effect<void, EngineError | SqliteError, Environment> =>
  Effect.gen(function* () {
    for (const person of yield* readPeople) {
      const backups = yield* personSimklBackups(person)
      if (backups.rows.length > 0) yield* loadPerson(db, person, backups)
    }
  })

/** Every Simkl Fato wiped and loaded again, in its own write: what the app
 * runs on start (#104), like `reloadTrakt`. */
export const reloadSimkl: Effect.Effect<
  void,
  EngineError | SqliteError,
  Environment | Sqlite
> = Effect.flatMap(Sqlite, (sqlite) =>
  sqlite.write((db) =>
    Effect.gen(function* () {
      for (const table of FACT_TABLES)
        yield* db.run(`DELETE FROM ${table} WHERE fato_id LIKE 'simkl:%'`)
      yield* loadSimkl(db)
    }),
  ),
)

/** Redoes the Pessoa's Simkl Fatos from the backups she has now, even
 * none. */
export const reloadPersonSimkl = (
  db: Connection,
  person: Person,
): Effect.Effect<void, EngineError | SqliteError, Environment> =>
  Effect.flatMap(personSimklBackups(person), (backups) =>
    Effect.asVoid(loadPerson(db, person, backups)),
  )

export type SimklFactCounts = Readonly<
  Record<'ratings' | 'seen' | 'watchlist', number>
>

export const simklFactCounts = (
  db: Connection,
  slug: string,
): Effect.Effect<SimklFactCounts, SqliteError> =>
  Effect.gen(function* () {
    const count = (table: (typeof FACT_TABLES)[number]) =>
      Effect.map(
        db.get(
          `SELECT count(*) AS n FROM ${table} WHERE pessoa = ? AND fato_id LIKE 'simkl:%'`,
          slug,
        ),
        (row) => Number(row?.n ?? 0),
      )
    return {
      ratings: yield* count('notas'),
      seen: yield* count('ja_visto'),
      watchlist: yield* count('watchlist'),
    }
  })

/** Asks TMDB for the tconst of each film of `rows` that its ids leave out
 * of the Catálogo, and records the answers in the import record of `file`.
 * Returns the Pessoa as saved. */
const recordTmdbAnswers = (
  db: Connection,
  person: Person,
  file: string,
  rows: readonly SimklRow[],
): Effect.Effect<Person, EngineError | SqliteError, Environment | Run | Tmdb> =>
  Effect.gen(function* () {
    const record = simklRecords(person).find(
      (r) => pyStrValue(r.get('file') ?? null) === file,
    )
    if (record === undefined) return person
    const known = new Map(answersOf(record))
    const wikidata = yield* hasWikidata(db)
    const tmdb = yield* Tmdb
    let changed = false
    for (const { film } of rows) {
      if (film.tmdb === null || known.has(film.tmdb)) continue
      if ((yield* resolveFilmIds(db, film, wikidata)) !== null) continue
      const tconst = yield* tmdb.imdbId(film.tmdb)
      if (tconst === undefined) continue
      known.set(film.tmdb, tconst)
      changed = true
    }
    if (!changed) return person
    const updated: Person = {
      ...person,
      imports: person.imports.map((r): YamlValue =>
        r === record ? new Map([...record, [TMDB_FIELD, known]]) : r,
      ),
    }
    yield* savePerson(updated)
    return updated
  })

export interface SimklImport extends SimklReport {
  readonly person: string
  /** The kept copy, relative to filmes-dados. */
  readonly file: string
  /** False when the same file had been imported before. */
  readonly newFile: boolean
  readonly facts: SimklFactCounts
  readonly newFacts: SimklFactCounts
  readonly warnings: readonly string[]
  readonly attributions: readonly Attribution[]
}

export interface SimklImportInput {
  /** Slug, name or alias; "dono" is the Dono. */
  readonly person: string
  /** The file's name as uploaded: the messages and the record show it. */
  readonly original: string
  /** The bytes of `SimklBackup.json` or of the ZIP that holds it. */
  readonly content: Uint8Array
  /** Who asked: the commit's author. */
  readonly author: Author
}

/** Imports a Pessoa's Simkl backup: keeps it, asks TMDB for what its ids
 * leave out, and reloads her Simkl Fatos from all her backups. */
export const importSimkl = (
  input: SimklImportInput,
): Effect.Effect<
  SimklImport,
  EngineError | SqliteError | GitError,
  Environment | Sqlite | Run | Tmdb | DataWriter
> =>
  Effect.gen(function* () {
    // Read first: a file that does not read is refused before it is kept.
    const rows = yield* attempt(() =>
      readSimklBackup(input.original, input.content),
    )
    const writer = yield* DataWriter
    return yield* writer.write(
      {
        author: input.author,
        message: `import simkl ${input.person}: ${input.original}`,
      },
      (db) =>
        Effect.gen(function* () {
          yield* requireImportTables(db)
          const person = yield* resolvePerson(input.person)
          const before = yield* simklFactCounts(db, person.slug)
          const kept = yield* storeImport(
            person,
            SIMKL_KIND,
            input.original,
            input.content,
            simklExtension(input.content),
          )
          const saved = yield* recordTmdbAnswers(
            db,
            kept.person,
            kept.file,
            rows,
          )
          const backups = yield* personSimklBackups(saved)
          const report = yield* loadPerson(db, saved, backups)
          const after = yield* simklFactCounts(db, person.slug)
          return {
            ...report,
            person: person.slug,
            file: kept.file,
            newFile: kept.new,
            facts: after,
            newFacts: {
              ratings: after.ratings - before.ratings,
              seen: after.seen - before.seen,
              watchlist: after.watchlist - before.watchlist,
            },
            warnings: yield* (yield* Run).warnings,
            attributions: backups.answers.size > 0 ? [TMDB_ATTRIBUTION] : [],
          }
        }),
    )
  })
