// The IMDb ratings import (#285): a Pessoa's "Your Ratings" CSV. `Const`
// is the tconst, so a film resolves only by being in the Catálogo; the rest
// (series, episodes, films the Catálogo lacks) is reported, not queued, and
// comes in at the next rebuild if the Catálogo gains it.
//
// Each row is a Nota (and so a Já visto, by the `ja_vistos` view), IMDb's
// 1 to 10 halved to the 0.5 to 5 of the others, read on the Pessoa's Escala
// like any Nota. Fatos have an `imdb:...` fato_id and Fonte "IMDb de
// <name>". Every change reloads the Pessoa's IMDb Fatos from all her stored
// CSVs, so the database can always be rebuilt from filmes-dados.
import { basename } from 'node:path'
import { Effect } from 'effect'
import { factId, pyFloat } from '../compat/fact-id.ts'
import { DataWriter, type Author } from '../data/DataWriter.ts'
import type { GitError } from '../data/git.ts'
import { readPeople, resolvePerson } from '../people/people.ts'
import type { Person } from '../people/Person.ts'
import { EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import type { Run } from '../runtime/Run.ts'
import { Sqlite, type Connection, type SqliteError } from '../sqlite/Sqlite.ts'
import { readImdbRatings, type ImdbRatingRow } from './imdb-ratings.ts'
import { storedImports, storeImport } from './stored.ts'
import { requireImportTables } from './trakt.ts'

/** The kind of a Pessoa's `imports:` records this module reads. */
export const IMDB_KIND = 'imdb'

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

/** The rows of every CSV the Pessoa has stored, in record order. */
const personImdbRows = (
  person: Person,
): Effect.Effect<ImdbRatingRow[], EngineError, Environment> =>
  Effect.map(
    storedImports(person, IMDB_KIND, (path, content) =>
      attempt(() => readImdbRatings(basename(path), content)),
    ),
    (files) => files.flat(),
  )

/** A rated title the Catálogo does not have. */
export interface ImdbOutside {
  readonly film: string
  readonly title: string | null
}

/** Replaces the Pessoa's IMDb Fatos by those of the rows; the titles left
 * out, each once, in the order the rows had them. */
const loadPerson = (
  db: Connection,
  person: Person,
  rows: readonly ImdbRatingRow[],
): Effect.Effect<ImdbOutside[], SqliteError> =>
  Effect.gen(function* () {
    yield* db.run(
      "DELETE FROM notas WHERE pessoa = ? AND fato_id LIKE 'imdb:%'",
      person.slug,
    )
    const source = `IMDb de ${person.name}`
    const known = new Map<string, boolean>()
    const outside = new Map<string, ImdbOutside>()
    for (const row of rows) {
      let inCatalog = known.get(row.film)
      if (inCatalog === undefined) {
        inCatalog =
          (yield* db.get('SELECT 1 FROM filmes WHERE id = ?', row.film)) !==
          undefined
        known.set(row.film, inCatalog)
      }
      if (!inCatalog) {
        if (!outside.has(row.film))
          outside.set(row.film, { film: row.film, title: row.title })
        continue
      }
      yield* db.run(
        `INSERT INTO notas (fato_id, pessoa, filme_id, fonte, data, nota)
         VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(fato_id) DO NOTHING`,
        factId(
          IMDB_KIND,
          'notas',
          person.slug,
          row.film,
          row.date,
          pyFloat(row.rating),
        ),
        person.slug,
        row.film,
        source,
        row.date,
        row.rating,
      )
    }
    return [...outside.values()]
  })

/** Redoes every Pessoa's IMDb Fatos: the rebuild. */
export const loadImdb = (
  db: Connection,
): Effect.Effect<void, EngineError | SqliteError, Environment> =>
  Effect.gen(function* () {
    for (const person of yield* readPeople) {
      const rows = yield* personImdbRows(person)
      if (rows.length > 0) yield* loadPerson(db, person, rows)
    }
  })

/** Every IMDb Fato wiped and loaded again, in its own write: what the app
 * runs on start (#104), like `reloadTrakt`. */
export const reloadImdb: Effect.Effect<
  void,
  EngineError | SqliteError,
  Environment | Sqlite
> = Effect.flatMap(Sqlite, (sqlite) =>
  sqlite.write((db) =>
    Effect.gen(function* () {
      yield* db.run("DELETE FROM notas WHERE fato_id LIKE 'imdb:%'")
      yield* loadImdb(db)
    }),
  ),
)

/** Redoes the Pessoa's IMDb Fatos from the CSVs she has now, even none. */
export const reloadPersonImdb = (
  db: Connection,
  person: Person,
): Effect.Effect<void, EngineError | SqliteError, Environment> =>
  Effect.flatMap(personImdbRows(person), (rows) =>
    Effect.asVoid(loadPerson(db, person, rows)),
  )

export type ImdbFactCounts = Readonly<Record<'ratings', number>>

export const imdbFactCounts = (
  db: Connection,
  slug: string,
): Effect.Effect<ImdbFactCounts, SqliteError> =>
  Effect.map(
    db.get(
      "SELECT count(*) AS n FROM notas WHERE pessoa = ? AND fato_id LIKE 'imdb:%'",
      slug,
    ),
    (row) => ({ ratings: Number(row?.n ?? 0) }),
  )

export interface ImdbImport {
  readonly person: string
  /** The kept copy, relative to filmes-dados. */
  readonly file: string
  /** False when the same file had been imported before. */
  readonly newFile: boolean
  readonly facts: ImdbFactCounts
  readonly newFacts: ImdbFactCounts
  /** Rated titles the Catálogo does not have, from all her CSVs. */
  readonly outsideCatalog: readonly ImdbOutside[]
}

export interface ImdbImportInput {
  /** Slug, name or alias; "dono" is the Dono. */
  readonly person: string
  /** The file's name as uploaded: the messages and the record show it. */
  readonly original: string
  /** The CSV's bytes. */
  readonly content: Uint8Array
  /** Who asked: the commit's author. */
  readonly author: Author
}

/** Imports a Pessoa's IMDb ratings CSV: keeps it and reloads her IMDb
 * Fatos from all her CSVs. */
export const importImdb = (
  input: ImdbImportInput,
): Effect.Effect<
  ImdbImport,
  EngineError | SqliteError | GitError,
  Environment | Sqlite | Run | DataWriter
> =>
  Effect.gen(function* () {
    const rows = yield* attempt(() =>
      readImdbRatings(input.original, input.content),
    )
    const writer = yield* DataWriter
    return yield* writer.write(
      {
        author: input.author,
        message: `import imdb ${input.person}: ${input.original}`,
      },
      (db) =>
        Effect.gen(function* () {
          yield* requireImportTables(db)
          const person = yield* resolvePerson(input.person)
          const before = yield* imdbFactCounts(db, person.slug)
          const stored = yield* personImdbRows(person)
          const outsideCatalog = yield* loadPerson(db, person, [
            ...stored,
            ...rows,
          ])
          const after = yield* imdbFactCounts(db, person.slug)
          const kept = yield* storeImport(
            person,
            IMDB_KIND,
            input.original,
            input.content,
            'csv',
          )
          return {
            person: person.slug,
            file: kept.file,
            newFile: kept.new,
            facts: after,
            newFacts: { ratings: after.ratings - before.ratings },
            outsideCatalog,
          }
        }),
    )
  })
