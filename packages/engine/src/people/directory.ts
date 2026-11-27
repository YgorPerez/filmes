// What the app's Pessoas screens show beyond a Pessoa's own file (#273): how
// much the filmes knows of each one (her Notas, her Vetos), the Sessões she
// was in with her reaction to each, and taking out a Pessoa made by mistake.
//
// Taking a Pessoa out removes her file and her rows only when nothing else
// in filmes-dados names her: no Session lists her among the Presentes and
// no import holds her history. Otherwise the file stays: a Session's
// Feedback or an import read back by a rebuild would name a Pessoa that is
// gone. A Dono keeps her file too: her access comes off first.

import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { Environment } from '../runtime/Environment.ts'
import { Sqlite, type Connection, type SqliteError } from '../sqlite/Sqlite.ts'
import { num, text } from '../sqlite/row.ts'
import { yamlToJson } from '../data/yaml.ts'
import { readSession, sessionIds } from '../sessions/file.ts'
import {
  writePerson,
  type PersonServices,
  type PersonWriteError,
  type WrittenBy,
} from './actions.ts'
import { peopleFolder, readPeople, resolvePerson } from './people.ts'

/** How much the filmes knows of one Pessoa, for the list's rows. */
export interface PersonCounts {
  readonly person: string
  /** Her Notas in force; null without a database. */
  readonly ratings: number | null
  readonly vetoes: number
}

/** The database when it exists, else null: the counts read it only then. */
const readIfBuilt = <A>(
  use: (db: Connection) => Effect.Effect<A, SqliteError>,
): Effect.Effect<A | null, EngineError | SqliteError, Environment | Sqlite> =>
  Effect.gen(function* () {
    const path = yield* (yield* Environment).path('database')
    if (!(yield* Effect.sync(() => existsSync(path)))) return null
    return yield* (yield* Sqlite).read(use)
  })

/** Every Pessoa's Notas and Vetos, by file name, as `readPeople`. */
export const peopleCounts: Effect.Effect<
  ReadonlyArray<PersonCounts>,
  EngineError | SqliteError,
  Environment | Sqlite
> = Effect.gen(function* () {
  const people = yield* readPeople
  const ratings = yield* readIfBuilt((db) =>
    Effect.map(
      db.all(
        'SELECT pessoa, COUNT(*) AS n FROM notas_vigentes GROUP BY pessoa',
      ),
      (rows) => new Map(rows.map((r) => [text(r, 'pessoa'), num(r, 'n')])),
    ),
  )
  return people.map((p) => ({
    person: p.slug,
    ratings: ratings === null ? null : (ratings.get(p.slug) ?? 0),
    vetoes: p.vetoes.length,
  }))
})

/** A Session the Pessoa was in, the latest first. */
export interface PersonSession {
  readonly id: string
  readonly date: string
  /** The film the Feedback chose, or null (open, or "não vimos nada"). */
  readonly chosen: { readonly id: string; readonly title: string } | null
  /** Her reaction to it, from 0 to 1, as the Satisfação reads it; null
   * when she gave none. */
  readonly reaction: number | null
}

/** The Sessions a Pessoa was in and how she came out of them. */
export interface PersonSessions {
  /** How many Sessions list her among the Presentes. */
  readonly total: number
  /** The latest ones, at most `limit`. */
  readonly recent: ReadonlyArray<PersonSession>
  /** The mean of her reactions over the latest `[satisfaction] window`
   * Sessions she reacted in, and how many those are; null with none. */
  readonly satisfaction: {
    readonly value: number
    readonly sessions: number
  } | null
}

const NO_SESSIONS: PersonSessions = {
  total: 0,
  recent: [],
  satisfaction: null,
}

/** The Sessions the Pessoa (slug, name or alias) was in, from the
 * database: the latest `limit`, with her reaction to each, and her recent
 * Satisfação. Without a database, none. */
export const personSessions = (
  name: string,
  limit = 3,
): Effect.Effect<
  PersonSessions,
  EngineError | SqliteError,
  Environment | Sqlite
> =>
  Effect.gen(function* () {
    const { slug } = yield* resolvePerson(name)
    const { weights } = yield* Environment
    const found = yield* readIfBuilt((db) =>
      Effect.gen(function* () {
        const rows = yield* db.all(
          `SELECT s.id, s.data, s.escolhido, f.titulo,
                  (SELECT AVG(r.valor) FROM reacoes r
                   WHERE r.sessao = s.id AND r.pessoa = p.pessoa) AS reacao
           FROM sessoes s
           JOIN sessao_presentes p ON p.sessao = s.id
           LEFT JOIN filmes f ON f.id = s.escolhido
           WHERE p.pessoa = ?
           ORDER BY s.data DESC, s.id DESC`,
          slug,
        )
        const sessions = rows.map(
          (row): PersonSession => ({
            id: text(row, 'id'),
            date: text(row, 'data'),
            chosen:
              row.escolhido === null
                ? null
                : {
                    id: String(row.escolhido),
                    title:
                      row.titulo === null
                        ? String(row.escolhido)
                        : String(row.titulo),
                  },
            reaction: row.reacao === null ? null : Number(row.reacao),
          }),
        )
        const reacted = sessions
          .flatMap((s) => (s.reaction === null ? [] : [s.reaction]))
          .slice(0, weights.satisfaction.window)
        return {
          total: sessions.length,
          recent: sessions.slice(0, limit),
          satisfaction:
            reacted.length === 0
              ? null
              : {
                  value: reacted.reduce((a, b) => a + b, 0) / reacted.length,
                  sessions: reacted.length,
                },
        }
      }),
    )
    return found ?? NO_SESSIONS
  })

export interface PersonDeleteInput extends WrittenBy {
  /** Slug, name or alias. */
  readonly person: string
}

export interface PersonDeleteResult {
  readonly person: string
}

/** The tables that hold a Pessoa's rows by `pessoa`; `pessoas` by slug. */
const PERSON_TABLES = [
  'notas',
  'ja_visto',
  'declarados',
  'relatos',
  'vetos',
  'ajustes',
  'perguntas_abertas',
  'apelidos',
] as const

/** Whether a Session file lists the Pessoa among its Presentes. The
 * files, not the database: a Session written since the last rebuild
 * counts. */
const inSomeSession = (slug: string) =>
  Effect.gen(function* () {
    for (const id of yield* sessionIds) {
      const attendees = yamlToJson(
        (yield* readSession(id)).frontmatter.get('attendees') ?? null,
      )
      if (Array.isArray(attendees) && attendees.map(String).includes(slug))
        return true
    }
    return false
  })

/** Takes a Pessoa out of filmes-dados and the database: one made by
 * mistake, whom no Session and no import names. A Dono, a Pessoa in a
 * Session or one with an import stays, with the reason. */
export const personDelete = (
  input: PersonDeleteInput,
): Effect.Effect<PersonDeleteResult, PersonWriteError, PersonServices> =>
  writePerson(input, `pessoa remover ${input.person}`, (db) =>
    Effect.gen(function* () {
      const person = yield* resolvePerson(input.person)
      if (person.owner)
        return yield* engineError(
          'invalid_usage',
          `${person.slug} é Dono: tire o acesso antes`,
          'is_owner',
        )
      if (person.imports.length > 0)
        return yield* engineError(
          'invalid_usage',
          `${person.slug} tem histórico importado`,
          'has_imports',
        )
      if (yield* inSomeSession(person.slug))
        return yield* engineError(
          'invalid_usage',
          `${person.slug} está numa Sessão`,
          'in_session',
        )
      const folder = yield* peopleFolder
      yield* Effect.sync(() => unlinkSync(join(folder, `${person.slug}.md`)))
      if (db !== null)
        yield* Effect.forEach(
          [
            ...PERSON_TABLES.map((t) => `DELETE FROM ${t} WHERE pessoa = ?`),
            'DELETE FROM pessoas WHERE slug = ?',
          ],
          (sql) => db.run(sql, person.slug),
        ).pipe(
          Effect.catchTag('SqliteError', (error) =>
            Effect.fail(
              engineError(
                'outdated_database',
                `o arquivo da Pessoa saiu, mas o banco não aceitou (${error.message}): rode \`reconstruir\``,
              ),
            ),
          ),
        )
      return { person: person.slug }
    }),
  )
