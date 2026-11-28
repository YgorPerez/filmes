// The Fatos [facts] of a Pessoa in the database, from her file
// (`filmes/banco/pessoas.py`). The data reload loads every Pessoa; a write
// to one Pessoa's file syncs only her rows, so what the Dono said counts in
// the next Recomendação without a rebuild.
//
// The database is the Python engine's until reconstruct is ported (#76
// §2): Portuguese tables and columns, and Portuguese closed-list values in
// them (`nivel` is `pouco`, `reacao` is `nao_gosta`, a tag group is
// `comedia_boba`). Every fato_id hashes those same Portuguese values, so a
// Fato keeps the id the Python engine gave it, the one Sessions and the
// Dono's `pessoa remover` refer to. `DB_*` below are those spellings.

import { Effect } from 'effect'
import { factId, pyFloat, pyInt, type PyValue } from '../compat/fact-id.ts'
import { casefold } from '../compat/text.ts'
import type { Kind, Link } from '../evidence/strength.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { Sqlite, type Connection, type SqliteError } from '../sqlite/Sqlite.ts'
import { readPeople } from './people.ts'
import {
  items,
  type Adjustment,
  type GroupPick,
  type OpenQuestion,
  type Person,
  type Seen,
  type Statement,
  type StatementReaction,
  type Veto,
} from './Person.ts'
import type { Environment } from '../runtime/Environment.ts'

/** An Ajuste's elo, as the database keeps it. */
export const DB_LINKS: Readonly<Record<Link, string>> = {
  director: 'diretor',
  writer: 'roteiro',
  cast: 'elenco',
  series: 'serie',
  genre: 'genero',
  cinematography: 'fotografia',
  producer: 'produtor',
}

/** An Ajuste's nível, as the database keeps it. */
export const DB_LEVELS: Readonly<Record<Adjustment['level'], string>> = {
  none: 'nada',
  low: 'pouco',
  high: 'muito',
}

/** A Declarado's or a Relato's reaction, as the database keeps it. */
export const DB_REACTIONS: Readonly<Record<StatementReaction, string>> = {
  love: 'ama',
  like: 'gosta',
  dislike: 'nao_gosta',
  hate: 'odeia',
}

/** A tag group of `tag_vetoes.toml` (a Veto target, an open question's
 * subject), as the database keeps it. A group with no Portuguese name, born
 * after the English cutover, keeps its own. */
export const DB_TAG_GROUPS: Readonly<Record<string, string>> = {
  silly_comedy: 'comedia_boba',
  slow: 'lento',
}

/** The `tipo` of a row of `notas`, in the engine's names. */
const RATING_KINDS: Readonly<Record<string, Kind>> = {
  nota: 'rating',
  declarado: 'stated',
  relato: 'report',
}

const inverse = <K extends string>(
  table: Readonly<Record<K, string>>,
): ReadonlyMap<string, K> =>
  new Map(Object.entries(table).map(([en, pt]) => [pt as string, en as K]))

const REACTIONS_FROM_DB = inverse(DB_REACTIONS)

/** A Veto target or a subject, as the database keeps it. */
export const dbTarget = (target: string): string =>
  Object.hasOwn(DB_TAG_GROUPS, target)
    ? (DB_TAG_GROUPS[target] ?? target)
    : target

/** A `reacao` column, in the engine's names. */
export const reactionFromDb = (value: unknown): StatementReaction | null =>
  typeof value === 'string' ? (REACTIONS_FROM_DB.get(value) ?? null) : null

/** The `tipo` of a row of `notas`, in the engine's names. */
export const ratingKindFromDb = (value: unknown): Kind | null =>
  typeof value === 'string' && Object.hasOwn(RATING_KINDS, value)
    ? (RATING_KINDS[value] ?? null)
    : null

// --- fato_ids --------------------------------------------------------------

export const vetoId = (slug: string, veto: Veto): string =>
  factId('vetos', slug, dbTarget(veto.target), veto.text, veto.date)

export const adjustmentId = (slug: string, adjustment: Adjustment): string =>
  factId(
    'ajustes',
    slug,
    DB_LINKS[adjustment.link],
    DB_LEVELS[adjustment.level],
    adjustment.date,
  )

/** Does not change with the count or the date: the same question skipped
 * again keeps its id. */
export const questionId = (slug: string, question: OpenQuestion): string =>
  factId(
    'perguntas_abertas',
    slug,
    question.subject ? dbTarget(question.subject) : casefold(question.text),
  )

/** The table of a Declarado or a Relato. */
export type StatementTable = 'declarados' | 'relatos'

export const statementId = (
  table: StatementTable,
  slug: string,
  statement: Statement,
): string =>
  factId(
    table,
    slug,
    statement.date,
    statement.source,
    pyInt(statement.specific ? 1 : 0),
    statement.reaction === null ? null : DB_REACTIONS[statement.reaction],
    statement.target,
    statement.text,
  )

const ratingValue = (rating: number | null): PyValue =>
  rating === null ? null : pyFloat(rating)

export const seenId = (slug: string, seen: Seen): string =>
  factId(
    'vistos',
    slug,
    seen.date,
    seen.source,
    seen.target,
    ratingValue(seen.rating),
  )

const groupPickId = (slug: string, pick: GroupPick): string =>
  factId(
    'escolhas_de_grupo',
    slug,
    pick.date,
    pick.source,
    pick.group,
    pick.films.join(','),
  )

/** About a film, "ama" is a Nota 5 and "odeia" a Nota 1; nothing else is a
 * Nota. */
export const statedRating = (statement: Statement): number | null => {
  if (!statement.target?.startsWith('tt')) return null
  if (statement.reaction === 'love') return 5
  if (statement.reaction === 'hate') return 1
  return null
}

// --- the Catalog -------------------------------------------------------------

/** The film's title or the entity's label; a target outside the Catalog is
 * `unknown_target`. */
export const targetLabel = (
  db: Connection,
  target: string,
): Effect.Effect<string, EngineError | SqliteError> =>
  Effect.flatMap(
    target.startsWith('tt')
      ? db.get('SELECT titulo AS label FROM filmes WHERE id = ?', target)
      : db.get('SELECT rotulo AS label FROM entidades WHERE id = ?', target),
    (row) =>
      row === undefined
        ? Effect.fail(
            engineError('unknown_target', `'${target}' não está no Catálogo`),
          )
        : Effect.succeed(String(row.label)),
  )

/** The entity is only a genre in the Catalog: a Declarado about it is
 * generic. */
export const onlyGenre = (
  db: Connection,
  entity: string,
): Effect.Effect<boolean, SqliteError> =>
  Effect.map(
    db.all(
      'SELECT DISTINCT predicado FROM arestas WHERE entidade_id = ?',
      entity,
    ),
    (rows) => rows.length === 1 && rows[0]?.predicado === 'genero',
  )

// --- load and sync -----------------------------------------------------------

/** Code point order, as Python's `sorted` of str. */
const byCodePoint = (a: string, b: string): number => {
  const x = Array.from(a)
  const y = Array.from(b)
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = (x[i]?.codePointAt(0) ?? 0) - (y[i]?.codePointAt(0) ?? 0)
    if (d !== 0) return d
  }
  return x.length - y.length
}

/** The `pessoas` row and the frontmatter lists: apelidos, Vetos, Ajustes,
 * open questions. */
const insertFrontmatter = (db: Connection, person: Person) =>
  Effect.gen(function* () {
    const slug = person.slug
    yield* db.run(
      'INSERT INTO pessoas (slug, nome, dono) VALUES (?, ?, ?) ' +
        'ON CONFLICT (slug) DO UPDATE SET nome = excluded.nome, dono = excluded.dono',
      slug,
      person.name,
      person.owner ? 1 : 0,
    )
    for (const alias of [...new Set(person.aliases)].sort(byCodePoint))
      yield* db.run(
        'INSERT INTO apelidos (pessoa, apelido) VALUES (?, ?)',
        slug,
        alias,
      )
    for (const veto of person.vetoes)
      yield* db.run(
        'INSERT OR IGNORE INTO vetos (fato_id, pessoa, alvo, rotulo, texto, data) VALUES (?, ?, ?, ?, ?, ?)',
        vetoId(slug, veto),
        slug,
        dbTarget(veto.target),
        veto.label,
        veto.text,
        veto.date,
      )
    for (const adjustment of person.adjustments)
      yield* db.run(
        'INSERT INTO ajustes (fato_id, pessoa, elo, nivel, data) VALUES (?, ?, ?, ?, ?)',
        adjustmentId(slug, adjustment),
        slug,
        DB_LINKS[adjustment.link],
        DB_LEVELS[adjustment.level],
        adjustment.date,
      )
    for (const question of person.openQuestions)
      yield* db.run(
        'INSERT INTO perguntas_abertas (fato_id, pessoa, texto, assunto, rotulo, data, puladas) VALUES (?, ?, ?, ?, ?, ?, ?)',
        questionId(slug, question),
        slug,
        question.text,
        question.subject === null ? null : dbTarget(question.subject),
        question.label,
        question.date,
        question.skips,
      )
  })

/** The Declarados and Relatos, each with its Nota when it states one. */
const insertStatements = (db: Connection, person: Person) =>
  Effect.gen(function* () {
    const slug = person.slug
    for (const [table, section] of [
      ['declarados', 'stated'],
      ['relatos', 'reports'],
    ] as const) {
      for (const statement of yield* items(person, section)) {
        const id = statementId(table, slug, statement)
        yield* db.run(
          `INSERT OR IGNORE INTO ${table} (fato_id, pessoa, data, fonte, especifico, reacao, alvo, rotulo, texto)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id,
          slug,
          statement.date,
          statement.source,
          statement.specific ? 1 : 0,
          statement.reaction === null ? null : DB_REACTIONS[statement.reaction],
          statement.target,
          statement.label,
          statement.text,
        )
        const rating = statedRating(statement)
        if (rating !== null)
          yield* db.run(
            'INSERT OR IGNORE INTO notas (fato_id, pessoa, filme_id, nota, data, fonte, tipo) VALUES (?, ?, ?, ?, ?, ?, ?)',
            id,
            slug,
            statement.target,
            rating,
            statement.date,
            statement.source,
            table.slice(0, -1),
          )
      }
    }
  })

/** The Já vistos of the body: a Nota when rated, a ja_visto row otherwise. */
const insertSeen = (db: Connection, person: Person) =>
  Effect.gen(function* () {
    const slug = person.slug
    for (const seen of yield* items(person, 'seen')) {
      const id = seenId(slug, seen)
      if (seen.rating === null)
        yield* db.run(
          "INSERT OR IGNORE INTO ja_visto (fato_id, pessoa, filme_id, tipo, data, fonte) VALUES (?, ?, ?, 'declarado', ?, ?)",
          id,
          slug,
          seen.target,
          seen.date,
          seen.source,
        )
      // Every Nota is a Já visto too (view ja_vistos): no row in ja_visto.
      else
        yield* db.run(
          "INSERT OR IGNORE INTO notas (fato_id, pessoa, filme_id, nota, data, fonte, tipo, par_a_par) VALUES (?, ?, ?, ?, ?, ?, 'nota', ?)",
          id,
          slug,
          seen.target,
          seen.rating,
          seen.date,
          seen.source,
          seen.pairwise === true ? 1 : 0,
        )
    }
  })

/** The Escolhas de grupo: one row per film of the group. */
const insertGroupPicks = (db: Connection, person: Person) =>
  Effect.gen(function* () {
    const slug = person.slug
    for (const pick of yield* items(person, 'group_picks')) {
      const id = groupPickId(slug, pick)
      for (const [order, film] of pick.films.entries())
        yield* db.run(
          'INSERT OR IGNORE INTO escolhas_de_grupo (fato_id, pessoa, grupo, rotulo, filme_id, ordem, data, fonte) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          id,
          slug,
          pick.group,
          pick.label,
          film,
          order,
          pick.date,
          pick.source,
        )
    }
  })

/** Inserts the Pessoa's rows (`pessoas.carregar`). */
export const loadPerson = (
  db: Connection,
  person: Person,
): Effect.Effect<void, EngineError | SqliteError> =>
  Effect.gen(function* () {
    yield* insertFrontmatter(db, person)
    yield* insertStatements(db, person)
    yield* insertSeen(db, person)
    yield* insertGroupPicks(db, person)
  })

/** The Pessoa tables that came after databases already built: a sync
 * creates them when missing instead of asking for a rebuild (the file is
 * already saved). Python's `esquema/23_perguntas_abertas.sql`. */
const NEW_TABLES: ReadonlyArray<readonly [string, string]> = [
  [
    'perguntas_abertas',
    `CREATE TABLE perguntas_abertas (
    fato_id TEXT PRIMARY KEY,
    pessoa  TEXT NOT NULL REFERENCES pessoas(slug),
    texto   TEXT NOT NULL,
    assunto TEXT,
    rotulo  TEXT,
    data    TEXT NOT NULL,
    puladas INTEGER NOT NULL CHECK (puladas >= 1)
);
CREATE INDEX perguntas_abertas_por_assunto ON perguntas_abertas(assunto);`,
  ],
]

const createMissingTables = (db: Connection) =>
  Effect.forEach(NEW_TABLES, ([table, sql]) =>
    Effect.flatMap(
      db.get(
        "SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ?",
        table,
      ),
      (row) => (row === undefined ? db.exec(sql) : Effect.void),
    ),
  )

/** Deletes the rows that come from Pessoa files: one Pessoa's, or every
 * Pessoa's. The `pessoas` row stays (Sessions and imports refer to it). */
const deleteRows = (db: Connection, slug: string | null) => {
  const of = slug === null ? '' : 'pessoa = ? AND '
  const params = slug === null ? [] : [slug]
  return Effect.forEach(
    [
      `DELETE FROM notas WHERE ${of}(fato_id LIKE 'declarados:%' OR fato_id LIKE 'relatos:%' OR fato_id LIKE 'vistos:%')`,
      `DELETE FROM ja_visto WHERE ${of}fato_id LIKE 'vistos:%'`,
      `DELETE FROM declarados WHERE ${of}fato_id LIKE 'declarados:%'`,
      ...[
        'vetos',
        'ajustes',
        'perguntas_abertas',
        'relatos',
        'escolhas_de_grupo',
        'apelidos',
      ].map((table) =>
        slug === null
          ? `DELETE FROM ${table}`
          : `DELETE FROM ${table} WHERE pessoa = ?`,
      ),
    ],
    (sql) => db.run(sql, ...params),
  )
}

/** What SQLite refused while syncing: the file is saved, the database is
 * behind it. */
const outdated = (error: SqliteError) =>
  engineError(
    'outdated_database',
    `o arquivo da Pessoa foi salvo, mas o banco não aceitou a mudança (${error.message}): rode \`reconstruir\``,
  )

/** Replaces the Pessoa's rows with her file's (`pessoas.sincronizar`), on
 * the connection of the write that saved the file. */
export const syncPerson = (
  db: Connection,
  person: Person,
): Effect.Effect<void, EngineError> =>
  Effect.gen(function* () {
    yield* createMissingTables(db)
    yield* deleteRows(db, person.slug)
    yield* loadPerson(db, person)
  }).pipe(
    Effect.catchTag('SqliteError', (error) => Effect.fail(outdated(error))),
  )

/** Reloads every Pessoa's rows from filmes-dados, as a rebuild would load
 * them (Python's loading step `10_pessoas`): the start of a server whose
 * database was built before the latest writes. Returns the slugs loaded. A
 * `pessoas` row whose file is gone stays, like after a sync. */
export const reloadPeople: Effect.Effect<
  readonly string[],
  EngineError | SqliteError,
  Environment | Sqlite
> = Effect.gen(function* () {
  const sqlite = yield* Sqlite
  return yield* sqlite.write((db) =>
    Effect.gen(function* () {
      const people = yield* readPeople
      yield* createMissingTables(db)
      yield* deleteRows(db, null)
      for (const person of people) yield* loadPerson(db, person)
      return people.map((p) => p.slug)
    }),
  )
})
