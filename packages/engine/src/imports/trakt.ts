// The Trakt import (`importar/trakt.py`): the Notas and Já vistos of a
// Pessoa's Raw Export, by the ids the export carries. A film resolves by its
// IMDb id when the Catalog has it; otherwise by its TMDB id, when exactly
// one film of the Catalog has that id (Letterboxd's slugs table or
// Wikidata's P4947). The rest is reported, not queued.
//
// Fatos have a `trakt:...` fato_id and Fonte "Trakt de <name>". Every
// change reloads the Pessoa's Trakt Fatos from all her stored exports, so
// the database can always be rebuilt from filmes-dados.
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
import { storedImports, storeImport } from './stored.ts'
import {
  readTraktExport,
  type TraktFilm,
  type TraktRow,
} from './trakt-export.ts'

/** The kind of a Pessoa's `imports:` records this module reads. */
export const TRAKT_KIND = 'trakt'

const FACT_TABLES = ['notas', 'ja_visto'] as const

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

/** The rows of every export the Pessoa has stored, in record order. */
const personTraktRows = (
  person: Person,
): Effect.Effect<TraktRow[], EngineError, Environment> =>
  Effect.map(
    storedImports(person, TRAKT_KIND, (path, content) =>
      attempt(() => readTraktExport(basename(path), content)),
    ),
    (files) => files.flat(),
  )

type ResolvedBy = 'imdb' | 'tmdb'

const resolveFilm = (
  db: Connection,
  film: TraktFilm,
  wikidata: boolean,
): Effect.Effect<readonly [string, ResolvedBy] | null, SqliteError> =>
  Effect.gen(function* () {
    if (
      film.imdb &&
      (yield* db.get('SELECT 1 FROM filmes WHERE id = ?', film.imdb))
    )
      return [film.imdb, 'imdb'] as const
    if (!film.tmdb) return null
    const ids = new Set(
      (yield* db.all(
        'SELECT f.id FROM slugs_letterboxd s JOIN filmes f ON f.id = s.imdb WHERE s.tmdb = ? ORDER BY f.id',
        film.tmdb,
      )).map((row) => String(row.id)),
    )
    if (wikidata)
      for (const row of yield* db.all(
        `SELECT f.id FROM metadados_wikidata t
         JOIN metadados_wikidata i ON i.item = t.item AND i.propriedade = 'P345'
         JOIN filmes f ON f.id = i.valor
         WHERE t.propriedade = 'P4947' AND t.valor = ?
         ORDER BY f.id`,
        film.tmdb,
      ))
        ids.add(String(row.id))
    const [only] = ids
    return ids.size === 1 && only !== undefined
      ? ([only, 'tmdb'] as const)
      : null
  })

const insertFact = (
  db: Connection,
  slug: string,
  source: string,
  film: string,
  row: TraktRow,
): Effect.Effect<unknown, SqliteError> => {
  const day = row.instant.slice(0, 10)
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
const loadPerson = (
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
    const wikidata =
      (yield* db.get(
        "SELECT 1 FROM sqlite_master WHERE name = 'metadados_wikidata'",
      )) !== undefined
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
        found = yield* resolveFilm(db, film, wikidata)
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
      if (rows.length > 0) yield* loadPerson(db, person, rows)
    }
  })

/** `loadTrakt` in its own write: what the app runs on start (E23). */
export const reloadTrakt: Effect.Effect<
  void,
  EngineError | SqliteError,
  Environment | Sqlite
> = Effect.flatMap(Sqlite, (sqlite) => sqlite.write((db) => loadTrakt(db)))

/** Redoes the Pessoa's Trakt Fatos from the exports she has now, even none
 * (`recarregar`). */
export const reloadPersonTrakt = (
  db: Connection,
  person: Person,
): Effect.Effect<void, EngineError | SqliteError, Environment> =>
  Effect.flatMap(personTraktRows(person), (rows) =>
    Effect.asVoid(loadPerson(db, person, rows)),
  )

export type TraktFactCounts = Readonly<Record<'ratings' | 'seen', number>>

const countFacts = (
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
    return { ratings: yield* count('notas'), seen: yield* count('ja_visto') }
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
    const rows = yield* attempt(() =>
      readTraktExport(input.original, input.content),
    )
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
          const before = yield* countFacts(db, person.slug)
          const stored = yield* personTraktRows(person)
          const report = yield* loadPerson(db, person, [...stored, ...rows])
          const after = yield* countFacts(db, person.slug)
          const kept = yield* storeImport(
            person,
            TRAKT_KIND,
            input.original,
            input.content,
            'zip',
          )
          return {
            ...report,
            person: person.slug,
            file: kept.file,
            newFile: kept.new,
            facts: after,
            newFacts: {
              ratings: after.ratings - before.ratings,
              seen: after.seen - before.seen,
            },
            attributions: [TRAKT_ATTRIBUTION],
          }
        }),
    )
  })
