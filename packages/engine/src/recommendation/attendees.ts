// Who is who in a request: a Pessoa's slug, name or nickname, or "dono"
// (`recomendacao/presentes.py`). The match ignores ASCII case, as SQLite's
// `COLLATE NOCASE`.

import { Effect } from 'effect'
import { compareTuple } from '../compat/compare.ts'
import { casefold, pyStrip } from '../compat/text.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'

const slugOf = (row: { readonly [column: string]: unknown } | undefined) =>
  String(row?.['slug'])

const resolveOne = (
  db: Connection,
  name: string,
): Effect.Effect<string, EngineError | SqliteError> =>
  Effect.gen(function* () {
    if (casefold(name) === 'dono') {
      const owner = yield* db.get(
        'SELECT slug FROM pessoas WHERE dono = 1 ORDER BY slug',
      )
      if (!owner) {
        return yield* engineError(
          'unknown_person',
          'nenhuma Pessoa tem dono: true no repo de dados',
        )
      }
      return slugOf(owner)
    }
    const rows = yield* db.all(
      `SELECT slug FROM pessoas WHERE slug = ? COLLATE NOCASE OR nome = ? COLLATE NOCASE
       UNION SELECT pessoa FROM apelidos WHERE apelido = ? COLLATE NOCASE ORDER BY 1`,
      name,
      name,
      name,
    )
    const [first] = rows
    if (!first) {
      return yield* engineError(
        'unknown_person',
        `nenhuma Pessoa se chama '${name}'`,
      )
    }
    if (rows.length > 1) {
      const options = rows
        .map(slugOf)
        .sort((a, b) => compareTuple([a], [b]))
        .join(', ')
      return yield* engineError(
        'ambiguous_person',
        `'${name}' pode ser mais de uma Pessoa: ${options}`,
      )
    }
    return slugOf(first)
  })

/** The slugs of the named Pessoas, in the order named and each once. */
export const resolveAttendees = (
  db: Connection,
  names: ReadonlyArray<string>,
): Effect.Effect<ReadonlyArray<string>, EngineError | SqliteError> =>
  Effect.gen(function* () {
    const slugs: string[] = []
    for (const name of names) {
      const slug = yield* resolveOne(db, pyStrip(name))
      if (!slugs.includes(slug)) slugs.push(slug)
    }
    return slugs
  })
