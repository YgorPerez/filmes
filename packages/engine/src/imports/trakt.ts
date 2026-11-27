// The Trakt import (`importar/trakt.py`): the Notas, Já vistos and
// watchlist of a Pessoa's Raw Export, by the ids the export carries
// (`film-ids.ts`). The rest is reported, not queued.
//
// Fatos have a `trakt:...` fato_id and Fonte "Trakt de <name>". Every
// change reloads the Pessoa's Trakt Fatos from all her stored exports, so
// the database can always be rebuilt from filmes-dados. The watchlist is
// the latest export's that has one (`withLatestWatchlist`).
import { basename } from 'node:path'
import { Effect } from 'effect'
import { factId, pyFloat } from '../compat/fact-id.ts'
import { DataWriter, type Author } from '../data/DataWriter.ts'
import type { GitError } from '../data/git.ts'
import { readPeople, resolvePerson } from '../people/people.ts'
import type { Person } from '../people/Person.ts'
import {
  TRAKT_ATTRIBUTION,
  type Attribution,
} from '../recommendation/attributions.ts'
import { engineError, EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import type { Run } from '../runtime/Run.ts'
import { Sqlite, type Connection, type SqliteError } from '../sqlite/Sqlite.ts'
import { hasWikidata, resolveFilmIds, type ResolvedBy } from './film-ids.ts'
import { storedImports, storeImport } from './stored.ts'
import {
  hasTraktWatchlist,
  readTraktExport,
  readTraktSnapshot,
  type TraktRow,
} from './trakt-export.ts'
import { withLatestWatchlist, type ExportRows } from './watchlist.ts'

/** The kind of a Pessoa's `imports:` records this module reads. */
export const TRAKT_KIND = 'trakt'

/** The kind of the snapshots of her Trakt profile read by the API (#269):
 * each holds her whole history, so only the latest one counts. */
export const TRAKT_API_KIND = 'trakt-api'

const FACT_TABLES = ['notas', 'ja_visto', 'watchlist'] as const

/** Runs a function that throws the `EngineError` Python raised. */
const attempt = <A>(f: () => A): Effect.Effect<A, EngineError> =>
  Effect.suspend(() => {
    try {
      return Effect.succeed(f())
    } catch (error) {
      if (error instanceof EngineError) return Effect.fail(error)
      throw error
    }
  })

/** Refuses a database built before the imports (`abrir_escrita`). */
export const requireImportTables = (
  db: Connection,
): Effect.Effect<void, EngineError | SqliteError> =>
  Effect.gen(function* () {
    const current = yield* db.get(
      "SELECT 1 FROM sqlite_master WHERE name = 'itens_letterboxd'",
    )
    if (current === undefined)
      return yield* engineError(
        'outdated_database',
        'o banco ainda não tem o import do Letterboxd. Rode `reconstruir`.',
      )
  })

/** An export's rows, and whether it has a watchlist file. */
const readExport = (
  name: string,
  content: Uint8Array,
): Effect.Effect<ExportRows<TraktRow>, EngineError> =>
  attempt(() => ({
    rows: readTraktExport(name, content),
    hasWatchlist: hasTraktWatchlist(content),
  }))

/** The rows of every export the Pessoa has stored, in record order, then
 * those of her latest API snapshot, which has her whole profile; the
 * watchlist only from the latest of them with one. */
export const personTraktRows = (
  person: Person,
): Effect.Effect<TraktRow[], EngineError, Environment> =>
  Effect.gen(function* () {
    const exports = yield* storedImports(person, TRAKT_KIND, (path, content) =>
      readExport(basename(path), content),
    )
    const snapshots = yield* storedImports(
      person,
      TRAKT_API_KIND,
      (path, content) =>
        attempt(() => ({
          rows: readTraktSnapshot(basename(path), content),
          hasWatchlist: true,
        })),
    )
    const latest = snapshots.at(-1)
    return withLatestWatchlist(
      latest === undefined ? exports : [...exports, latest],
      (row) => row.watchlist,
    )
  })

const insertFact = (
  db: Connection,
  slug: string,
  source: string,
  film: string,
  row: TraktRow,
): Effect.Effect<unknown, SqliteError> => {
  const day = row.instant.slice(0, 10)
  if (row.watchlist)
    return db.run(
      `INSERT INTO watchlist (fato_id, pessoa, filme_id, fonte, data)
       VALUES (?, ?, ?, ?, ?) ON CONFLICT(fato_id) DO NOTHING`,
      factId(TRAKT_KIND, 'watchlist', slug, film, row.instant),
      slug,
      film,
      source,
      day,
    )
  if (row.rating === null)
    return db.run(
      `INSERT INTO ja_visto (fato_id, pessoa, filme_id, fonte, data, tipo)
       VALUES (?, ?, ?, ?, ?, 'declarado') ON CONFLICT(fato_id) DO NOTHING`,
      factId(TRAKT_KIND, 'ja_visto', slug, film, row.instant),
      slug,
      film,
      source,
      day,
    )
  return db.run(
    `INSERT INTO notas (fato_id, pessoa, filme_id, fonte, data, nota)
     VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(fato_id) DO NOTHING`,
    factId(TRAKT_KIND, 'notas', slug, film, row.instant, pyFloat(row.rating)),
    slug,
    film,
    source,
    day,
    row.rating,
  )
}

/** A film the Catalog could not resolve, as the report shows it. */
export interface TraktUnresolved {
  readonly name: string | null
  readonly imdb: string | null
  readonly tmdb: string | null
  /** Python's int; past 2^53 it loses precision here. */
  readonly trakt: number | null
}

export interface TraktReport {
  /** Films resolved by each id; a film some export gave by its IMDb id
   * counts there only. */
  readonly resolved: Readonly<Record<ResolvedBy, number>>
  readonly unresolved: readonly TraktUnresolved[]
}

/** `_carregar_pessoa`: replaces the Pessoa's Trakt Fatos by those of the
 * rows. */
export const loadPersonTrakt = (
  db: Connection,
  person: Person,
  rows: readonly TraktRow[],
): Effect.Effect<TraktReport, SqliteError> =>
  Effect.gen(function* () {
    for (const table of FACT_TABLES)
      yield* db.run(
        `DELETE FROM ${table} WHERE pessoa = ? AND fato_id LIKE 'trakt:%'`,
        person.slug,
      )
    const wikidata = yield* hasWikidata(db)
    const source = `Trakt de ${person.name}`
    const resolutions = new Map<string, readonly [string, ResolvedBy] | null>()
    const resolved = { imdb: new Set<string>(), tmdb: new Set<string>() }
    const unresolved: TraktUnresolved[] = []
    for (const row of rows) {
      const { film } = row
      const key = JSON.stringify([
        film.name,
        film.imdb,
        film.tmdb,
        film.trakt?.toString() ?? null,
      ])
      let found = resolutions.get(key)
      if (found === undefined) {
        found = yield* resolveFilmIds(db, film, wikidata)
        resolutions.set(key, found)
        if (found === null)
          unresolved.push({
            name: film.name,
            imdb: film.imdb,
            tmdb: film.tmdb,
            trakt: film.trakt === null ? null : Number(film.trakt),
          })
      }
      if (found === null) continue
      const [id, by] = found
      resolved[by].add(id)
      yield* insertFact(db, person.slug, source, id, row)
    }
    // A direct id wins the count when more than one export has the film.
    for (const id of resolved.imdb) resolved.tmdb.delete(id)
    return {
      resolved: { imdb: resolved.imdb.size, tmdb: resolved.tmdb.size },
      unresolved,
    }
  })

/** Redoes every Pessoa's Trakt Fatos (`carregar`): the rebuild. */
export const loadTrakt = (
  db: Connection,
): Effect.Effect<void, EngineError | SqliteError, Environment> =>
  Effect.gen(function* () {
    for (const person of yield* readPeople) {
      const rows = yield* personTraktRows(person)
      if (rows.length > 0) yield* loadPersonTrakt(db, person, rows)
    }
  })

/** Every Trakt Fato wiped and loaded again, in its own write: what the app
 * runs on start (#104). Unlike `loadTrakt`, which a rebuild runs on an
 * empty database, it also drops the Fatos of a Pessoa who has no export
 * left (removed after the database was built). */
export const reloadTrakt: Effect.Effect<
  void,
  EngineError | SqliteError,
  Environment | Sqlite
> = Effect.flatMap(Sqlite, (sqlite) =>
  sqlite.write((db) =>
    Effect.gen(function* () {
      for (const table of FACT_TABLES)
        yield* db.run(`DELETE FROM ${table} WHERE fato_id LIKE 'trakt:%'`)
      yield* loadTrakt(db)
    }),
  ),
)

/** Redoes the Pessoa's Trakt Fatos from the exports she has now, even none
 * (`recarregar`). */
export const reloadPersonTrakt = (
  db: Connection,
  person: Person,
): Effect.Effect<void, EngineError | SqliteError, Environment> =>
  Effect.flatMap(personTraktRows(person), (rows) =>
    Effect.asVoid(loadPersonTrakt(db, person, rows)),
  )

export type TraktFactCounts = Readonly<
  Record<'ratings' | 'seen' | 'watchlist', number>
>

export const traktFactCounts = (
  db: Connection,
  slug: string,
): Effect.Effect<TraktFactCounts, SqliteError> =>
  Effect.gen(function* () {
    const count = (table: (typeof FACT_TABLES)[number]) =>
      Effect.map(
        db.get(
          `SELECT count(*) AS n FROM ${table} WHERE pessoa = ? AND fato_id LIKE 'trakt:%'`,
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

export interface TraktImport extends TraktReport {
  readonly person: string
  /** The kept copy, relative to filmes-dados. */
  readonly file: string
  /** False when the same file had been imported before. */
  readonly newFile: boolean
  readonly facts: TraktFactCounts
  readonly newFacts: TraktFactCounts
  readonly attributions: readonly Attribution[]
}

export interface TraktImportInput {
  /** Slug, name or alias; "dono" is the Dono. */
  readonly person: string
  /** The file's name as uploaded: the messages and the record show it. */
  readonly original: string
  /** The ZIP's bytes. */
  readonly content: Uint8Array
  /** Who asked: the commit's author. */
  readonly author: Author
}

/** Imports a Pessoa's Trakt Raw Export (`importar --trakt`): keeps the
 * ZIP and reloads her Trakt Fatos from all her exports. */
export const importTrakt = (
  input: TraktImportInput,
): Effect.Effect<
  TraktImport,
  EngineError | SqliteError | GitError,
  Environment | Sqlite | Run | DataWriter
> =>
  Effect.gen(function* () {
    // Read first: a file that does not read is refused before it is kept.
    yield* readExport(input.original, input.content)
    const writer = yield* DataWriter
    return yield* writer.write(
      {
        author: input.author,
        message: `import trakt ${input.person}: ${input.original}`,
      },
      (db) =>
        Effect.gen(function* () {
          yield* requireImportTables(db)
          const person = yield* resolvePerson(input.person)
          const before = yield* traktFactCounts(db, person.slug)
          // Kept before loading, so the Fatos are those a rebuild gives:
          // the same file imported again stays where it was recorded.
          const kept = yield* storeImport(
            person,
            TRAKT_KIND,
            input.original,
            input.content,
            'zip',
          )
          const report = yield* loadPersonTrakt(
            db,
            kept.person,
            yield* personTraktRows(kept.person),
          )
          const after = yield* traktFactCounts(db, person.slug)
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
            attributions: [TRAKT_ATTRIBUTION],
          }
        }),
    )
  })
