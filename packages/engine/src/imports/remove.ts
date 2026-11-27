// Removing an import (`importar/remover.py`): its record in the Pessoa's
// file, the stored file and its Fatos. The file is named by the path
// `pessoa ver` shows in `imports` (`imports/<slug>/...`) or by its name
// alone. The Fatos go by reloading the Pessoa's imports that are left, so a
// Fato another import also has stays, with that import's Fonte. The queue's
// decisions (imports/letterboxd.md) stay: they hold for every Pessoa.
import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { pyReprStr } from '../compat/text.ts'
import { DataWriter, type Author } from '../data/DataWriter.ts'
import type { GitError } from '../data/git.ts'
import {
  isMapping,
  pyStrValue,
  pyTruthy,
  yamlToJson,
  type YamlMapping,
} from '../data/yaml.ts'
import { readPeople, resolvePerson, savePerson } from '../people/people.ts'
import type { Person } from '../people/Person.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { Environment } from '../runtime/Environment.ts'
import type { Run } from '../runtime/Run.ts'
import type { Connection, Sqlite, SqliteError } from '../sqlite/Sqlite.ts'
import { reloadPersonImdb } from './imdb.ts'
import { loadLetterboxd, type FactCounts } from './letterboxd.ts'
import { reloadPersonSimkl } from './simkl.ts'
import { posixName } from './trakt-export.ts'
import { reloadPersonTrakt, requireImportTables } from './trakt.ts'

const FACT_TABLES = [
  ['notas', 'ratings'],
  ['ja_visto', 'seen'],
  ['declarados', 'stated'],
  ['watchlist', 'watchlist'],
] as const

/** The names an import answers to: its path and the path's last part. */
const namesOf = (record: YamlMapping): Set<string> => {
  const file = record.get('file')
  const path = pyTruthy(file) && file !== undefined ? pyStrValue(file) : ''
  return new Set([path, posixName(path)].filter((name) => name !== ''))
}

const countFacts = (
  db: Connection,
  slug: string,
): Effect.Effect<FactCounts, SqliteError> =>
  Effect.gen(function* () {
    const counts: Record<string, number> = {}
    for (const [table, name] of FACT_TABLES) {
      const row = yield* db.get(
        `SELECT count(*) AS n FROM ${table} WHERE pessoa = ? AND (fato_id LIKE 'letterboxd:%' OR fato_id LIKE 'trakt:%' OR fato_id LIKE 'imdb:%' OR fato_id LIKE 'simkl:%')`,
        slug,
      )
      counts[name] = Number(row?.n ?? 0)
    }
    return counts as FactCounts
  })

export interface ImportRemoval {
  readonly person: string
  /** The record removed, as the Pessoa's file had it. */
  readonly removed: unknown
  readonly facts: FactCounts
  readonly removedFacts: FactCounts
}

export interface ImportRemovalInput {
  /** The stored file's path, or only its name. */
  readonly file: string
  /** Slug, name or alias, to look only at her imports. */
  readonly person?: string | undefined
  /** Who asked: the commit's author. */
  readonly author: Author
}

/** The one import of the candidates that answers to the file; none is
 * `unknown_import`, more than one `ambiguous_import`. */
const findImport = (input: ImportRemovalInput) =>
  Effect.gen(function* () {
    const candidates: readonly Person[] = input.person
      ? [yield* resolvePerson(input.person)]
      : yield* readPeople
    const found = candidates.flatMap((person) =>
      person.imports.flatMap((record, index) =>
        isMapping(record) && namesOf(record).has(input.file)
          ? [{ person, record, index }]
          : [],
      ),
    )
    const [match] = found
    if (match === undefined) {
      const whose = input.person ? ` de ${candidates[0]?.slug ?? ''}` : ''
      return yield* engineError(
        'unknown_import',
        `nenhum import${whose} tem o arquivo ${pyReprStr(input.file)}; veja \`imports\` em \`pessoa ver\``,
      )
    }
    if (found.length > 1)
      return yield* engineError(
        'ambiguous_import',
        `${pyReprStr(input.file)} pode ser mais de um import: ${found
          .map(({ record }) => pyStrValue(record.get('file') ?? null))
          .join(', ')}`,
      )
    return match
  })

/** Saves the Pessoa without the import, reloads her Fatos and deletes the
 * stored file, counting the Fatos before and after. */
const dropImport = (
  db: Connection,
  removal: {
    readonly person: Person
    readonly record: YamlMapping
    readonly file: string
    readonly root: string
  },
) =>
  Effect.gen(function* () {
    const { person, record, file, root } = removal
    yield* requireImportTables(db)
    const before = yield* countFacts(db, person.slug)
    yield* savePerson(person)
    yield* loadLetterboxd(db)
    yield* reloadPersonTrakt(db, person)
    yield* reloadPersonImdb(db, person)
    yield* reloadPersonSimkl(db, person)
    const after = yield* countFacts(db, person.slug)
    yield* Effect.sync(() => rmSync(join(root, file), { force: true }))
    return {
      person: person.slug,
      removed: yamlToJson(record),
      facts: after,
      removedFacts: {
        ratings: before.ratings - after.ratings,
        seen: before.seen - after.seen,
        stated: before.stated - after.stated,
        watchlist: before.watchlist - after.watchlist,
      },
    }
  })

/** Removes an import (`importar --remover`). */
export const removeImport = (
  input: ImportRemovalInput,
): Effect.Effect<
  ImportRemoval,
  EngineError | SqliteError | GitError,
  Environment | Sqlite | Run | DataWriter
> =>
  Effect.gen(function* () {
    const match = yield* findImport(input)
    const { record, index } = match
    const file = pyStrValue(record.get('file') ?? null)
    const person: Person = {
      ...match.person,
      imports: match.person.imports.filter((_, at) => at !== index),
    }
    const root = yield* (yield* Environment).path('data')
    const writer = yield* DataWriter
    return yield* writer.write(
      {
        author: input.author,
        message: `remove import ${person.slug}: ${file}`,
      },
      (db) => dropImport(db, { person, record, file, root }),
    )
  })
