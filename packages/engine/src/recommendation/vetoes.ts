// The Presentes' Vetos: they remove films from the Candidates before any
// ordering (`recomendacao/vetos.py`).
//
// A Veto to an entity removes every film linked to it by some edge (genre,
// director, actor...); a Veto to a film removes that film. A Veto to a genre
// also removes the films of its subgenres, down Wikidata's P279
// (`subclasses_wikidata`), and the films whose IMDb genre is the equivalent
// of the vetoed genre or of one of those subgenres.
//
// A Veto to a tag group (a table of `tag_vetoes.toml`) removes the film with
// one of the group's IMDb genres and one of its tags at the `[tag_vetoes]`
// minimum, in the Tag Genome or in MovieLens' tags.csv. That path is "tags".
//
// Each film removed counts in the first path that took it, in this order:
// direct, subgenres, IMDb genre.

import { Effect, Schema } from 'effect'
import { WIKIDATA_GENRE } from '../catalog/genres.ts'
import { Environment } from '../runtime/Environment.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import type { Weights } from '../runtime/Weights.ts'
import { text } from '../sqlite/row.ts'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'
import { targetOf } from '../sqlite/vocabulary.ts'

export interface TagGroup {
  /** How it reads, in Portuguese ("comédia boba"). */
  readonly label: string
  /** Empty: any genre. */
  readonly imdbGenres: ReadonlyArray<string>
  readonly tags: ReadonlyArray<string>
}

const TagVetoesToml = Schema.Record(
  Schema.String,
  Schema.Struct({
    label: Schema.String,
    imdb_genres: Schema.optionalKey(Schema.Array(Schema.String)),
    tags: Schema.Array(Schema.String),
  }),
)

/** The tag groups of `tag_vetoes.toml`, by key. */
export const readTagGroups: Effect.Effect<
  ReadonlyMap<string, TagGroup>,
  EngineError,
  Environment
> = Effect.gen(function* () {
  const table = yield* (yield* Environment).readConfig(
    'tag_vetoes',
    TagVetoesToml,
  )
  return new Map(
    Object.entries(table).map(([key, group]) => [
      key,
      {
        label: group.label,
        imdbGenres: group.imdb_genres ?? [],
        tags: group.tags,
      },
    ]),
  )
})

/** A Veto target that is neither a film (tt...) nor an entity (Q...) is a
 * tag group's key. */
export const isTagGroup = (target: string): boolean =>
  !(target.startsWith('tt') || target.startsWith('Q'))

export type VetoPath = 'direct' | 'subgenres' | 'imdbGenre' | 'tags'

/** A Veto that removed at least one Candidate. */
export interface VetoReport {
  readonly person: string
  readonly text: string
  readonly target: string
  readonly label: string
  readonly filmsRemoved: number
  readonly byPath: Readonly<Partial<Record<VetoPath, number>>>
}

const marks = (values: ReadonlyArray<unknown>): string =>
  values.map(() => '?').join(', ')

/** The one column of every row, as a set. */
const column = (
  db: Connection,
  name: string,
  sql: string,
  params: ReadonlyArray<string | number>,
): Effect.Effect<Set<string>, SqliteError> =>
  Effect.map(
    db.all(sql, ...params),
    (rows) => new Set(rows.map((row) => text(row, name))),
  )

const BELOW = `
    WITH RECURSIVE abaixo(item) AS (
        SELECT item FROM subclasses_wikidata WHERE classe = ?
        UNION
        SELECT s.item FROM subclasses_wikidata s JOIN abaixo a ON s.classe = a.item
    )
    SELECT item FROM abaixo
`

type Paths = ReadonlyArray<readonly [VetoPath, ReadonlySet<string>]>

/** The films a query may return: all, or only those in a JSON list of ids
 * (the Candidates), so SQL leaves the rest of the catalog out.
 *
 * `test` keeps SQLite on the query's own index (tag, entity) and checks the
 * list per row: the unary `+` stops it from walking the list instead, which
 * on `genoma` is 7× slower. `walk` lets it walk the list, for `generos_imdb`,
 * which has no index on the genre. */
interface Scope {
  readonly test: string
  readonly walk: string
  readonly params: ReadonlyArray<string>
}

const scopeOf = (within: string | undefined): Scope =>
  within === undefined
    ? { test: '', walk: '', params: [] }
    : {
        test: ' AND +filme_id IN (SELECT value FROM json_each(?))',
        walk: ' AND filme_id IN (SELECT value FROM json_each(?))',
        params: [within],
      }

/** The films of a Veto to a film or an entity, by path, among `scope`. */
const entityPaths = (
  db: Connection,
  target: string,
  scope: Scope,
): Effect.Effect<Paths, SqliteError> =>
  Effect.gen(function* () {
    const direct = yield* column(
      db,
      'filme_id',
      `SELECT filme_id FROM arestas WHERE entidade_id = ?${scope.test}`,
      [target, ...scope.params],
    )
    const subgenres = yield* column(db, 'item', BELOW, [target])
    const ofSubgenres = yield* column(
      db,
      'filme_id',
      `SELECT filme_id FROM arestas WHERE predicado = 'genero' AND entidade_id IN (${marks([...subgenres])})${scope.test}`,
      [...subgenres, ...scope.params],
    )
    const imdb = [...WIKIDATA_GENRE]
      .filter(([, qid]) => qid === target || subgenres.has(qid))
      .map(([genre]) => genre)
    const ofImdbGenre = yield* column(
      db,
      'filme_id',
      `SELECT filme_id FROM generos_imdb WHERE genero IN (${marks(imdb)})${scope.walk}`,
      [...imdb, ...scope.params],
    )
    return [
      ['direct', new Set([target, ...direct])],
      ['subgenres', ofSubgenres],
      ['imdbGenre', ofImdbGenre],
    ] as const
  })

/** The films a tag group takes: an IMDb genre of the group and a tag at
 * the minimum of `[tag_vetoes]`. `key` is the group's English key.
 * `within`, a JSON list of film ids, limits the answer to those films. */
export const markedByGroup = (
  db: Connection,
  key: string,
  minimums: Weights['tag_vetoes'],
  within?: string,
): Effect.Effect<Set<string>, EngineError | SqliteError, Environment> =>
  Effect.gen(function* () {
    const group = (yield* readTagGroups).get(key)
    if (group === undefined) {
      return yield* engineError(
        'invalid_config',
        `grupo '${key}', que não está em config/tag_vetoes.toml`,
      )
    }
    const tags = group.tags.map((tag) => tag.toLowerCase())
    const scope = scopeOf(within)
    const marked = yield* column(
      db,
      'filme_id',
      `SELECT filme_id FROM genoma WHERE relevancia >= ? AND tag IN (${marks(tags)})${scope.test}`,
      [minimums.min_relevance, ...tags, ...scope.params],
    )
    for (const film of yield* column(
      db,
      'filme_id',
      `SELECT filme_id FROM tags_movielens WHERE usuarios >= ? AND tag IN (${marks(tags)})${scope.test}`,
      [minimums.min_users, ...tags, ...scope.params],
    ))
      marked.add(film)
    if (group.imdbGenres.length === 0) return marked
    const ofGenre = yield* column(
      db,
      'filme_id',
      `SELECT filme_id FROM generos_imdb WHERE genero IN (${marks(group.imdbGenres)})${scope.walk}`,
      [...group.imdbGenres, ...scope.params],
    )
    return new Set([...marked].filter((film) => ofGenre.has(film)))
  })

/** The Candidates left after the Presentes' Vetos, and the Vetos that
 * removed something. */
export const applyVetoes = <A>(
  db: Connection,
  attendees: ReadonlyArray<string>,
  candidates: ReadonlyMap<string, A>,
  minimums: Weights['tag_vetoes'],
): Effect.Effect<
  {
    readonly remaining: ReadonlyMap<string, A>
    readonly acted: ReadonlyArray<VetoReport>
  },
  EngineError | SqliteError,
  Environment
> =>
  Effect.gen(function* () {
    if (attendees.length === 0) return { remaining: candidates, acted: [] }
    const vetoes = yield* db.all(
      `SELECT pessoa, texto, alvo, rotulo FROM vetos WHERE pessoa IN (${marks(attendees)}) ORDER BY pessoa, data, fato_id`,
      ...attendees,
    )
    const remaining = new Map(candidates)
    const acted: VetoReport[] = []
    // Only the Candidates can be removed, so SQL looks at no other film.
    const within = JSON.stringify([...candidates.keys()])
    for (const veto of vetoes) {
      const target = targetOf(text(veto, 'alvo'))
      const paths: Paths = isTagGroup(target)
        ? [['tags', yield* markedByGroup(db, target, minimums, within)]]
        : yield* entityPaths(db, target, scopeOf(within))
      const byPath: Partial<Record<VetoPath, number>> = {}
      const removed = new Set<string>()
      for (const [path, films] of paths) {
        const added = [...films].filter(
          (film) => candidates.has(film) && !removed.has(film),
        )
        byPath[path] = added.length
        for (const film of added) removed.add(film)
      }
      for (const film of removed) remaining.delete(film)
      if (removed.size > 0)
        acted.push({
          person: text(veto, 'pessoa'),
          text: text(veto, 'texto'),
          target,
          label: text(veto, 'rotulo'),
          filmsRemoved: removed.size,
          byPath,
        })
    }
    return { remaining, acted }
  })
