// Escolha de grupo [group pick] (#415): before the Perguntas par a par,
// the Link da Sessão asks a Presente with few Notas "Qual destes grupos tem
// mais a sua cara?", with the groups of `config/film_groups.toml`. She picks
// 1 to `MAX_GROUP_PICKS` of them, or none. Research #405 measured it: one
// pick lifts a newcomer's recall@50 more than the 10 pairs, and the two
// together most. The signal is the group's 3 films, used as seeds of the
// MovieLens neighbourhood (`signals/group-pick.ts`); the labels only name
// the group.
//
// She is asked once per Session, and not at all once she has an Escolha de
// grupo of her own. A group with a film out of the Catálogo is not shown.
// The answer waits in the Session's `group_picks:` until the Dono decides,
// together with her pairwise answers (`decidePairwise`):
//
//     group_picks:
//     - {person: teo, groups: [bittersweet, noir], date: '2026-11-20'}
//     - {person: quim, groups: [], date: '2026-11-20'}
//
// An empty list is "nenhum": it waits for nothing. Recorded, each group
// becomes an Escolha de grupo in her file, with the group's films as the
// config has them then; each answer gets `recorded_on` (or
// `discarded_on`).

import { Effect } from 'effect'
import type { FilmRef } from '../catalog/search.ts'
import { DataWriter } from '../data/DataWriter.ts'
import type { GitError } from '../data/git.ts'
import {
  isMapping,
  isSequence,
  pyTruthy,
  yamlToJson,
  type YamlMapping,
  type YamlValue,
} from '../data/yaml.ts'
import { required } from '../people/actions.ts'
import { addItem, type Person } from '../people/Person.ts'
import { hasFewRatings } from '../people/rating-scale.ts'
import type { EngineServices } from '../runtime/Engine.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { Environment } from '../runtime/Environment.ts'
import { Run } from '../runtime/Run.ts'
import { numOrNull, text } from '../sqlite/row.ts'
import { Sqlite, type Connection, type SqliteError } from '../sqlite/Sqlite.ts'
import { sessionOwner } from './feedback.ts'
import { readAttendedSession, writeSession } from './file.ts'
import { readFilmGroups, type FilmGroup } from './film-groups.ts'
import { authorFor } from './open.ts'

/** The most groups one answer picks. */
export const MAX_GROUP_PICKS = 3

/** The Fonte of the Escolhas de grupo an answer becomes. */
export const groupPickSource = (session: string) =>
  `escolha de grupo ${session}`

/** A group as the Link da Sessão shows it. */
export interface GroupChoice {
  readonly id: string
  readonly name: string
  readonly labels: ReadonlyArray<string>
  readonly films: ReadonlyArray<FilmRef>
}

export interface GroupPickRequest {
  readonly session: string
  /** A slug among the current Presentes. */
  readonly person: string
}

export interface GroupPickAnswer extends GroupPickRequest {
  /** The groups' ids, none for "nenhum". */
  readonly groups: ReadonlyArray<string>
}

type Stored = {
  person?: unknown
  groups?: unknown
  recorded_on?: unknown
  discarded_on?: unknown
}

const KEY = 'group_picks'

const stored = (front: YamlMapping): YamlValue[] => {
  const list = front.get(KEY)
  return pyTruthy(list) && isSequence(list) ? [...list] : []
}

const plain = (item: YamlValue): Stored =>
  isMapping(item) ? (yamlToJson(item) as Stored) : {}

const groupsOf = (answer: Stored): string[] =>
  Array.isArray(answer.groups) ? answer.groups.map(String) : []

/** An answer with groups that no decision has taken yet. */
const waits = (answer: Stored) =>
  answer.recorded_on === undefined &&
  answer.discarded_on === undefined &&
  groupsOf(answer).length > 0

/** The waiting answers of `person`, each with its place in the list. */
export const waitingGroupPicksOf = (
  front: YamlMapping,
  person: string,
): ReadonlyArray<readonly [number, ReadonlyArray<string>]> =>
  stored(front).flatMap((item, index) => {
    const answer = plain(item)
    return answer.person === person && waits(answer)
      ? [[index, groupsOf(answer)] as const]
      : []
  })

/** Marks the answers at `indexes` as recorded or discarded on `today`. */
export const markGroupPicks = (
  front: Map<string, YamlValue>,
  indexes: ReadonlyArray<number>,
  mark: 'recorded_on' | 'discarded_on',
  today: string,
) => {
  if (indexes.length === 0) return
  const list = stored(front)
  for (const index of indexes)
    list[index] = new Map([...(list[index] as YamlMapping), [mark, today]])
  front.set(KEY, list)
}

/** Discards every answer that waits (the Session is going away). */
export const discardWaitingGroupPicks = (
  front: Map<string, YamlValue>,
  today: string,
) =>
  markGroupPicks(
    front,
    stored(front).flatMap((item, index) => (waits(plain(item)) ? [index] : [])),
    'discarded_on',
    today,
  )

/** The people with waiting answers, in the order each first answered. */
export const peopleWithGroupPicks = (front: YamlMapping): string[] => [
  ...new Set(
    stored(front)
      .map(plain)
      .filter(waits)
      .map((a) => String(a.person)),
  ),
]

const FILMS_IN_CATALOG = `
SELECT f.id, f.titulo, f.ano FROM filmes f
WHERE f.id IN (SELECT value FROM json_each(?))`

/** The groups with every film in the Catálogo, each film with its title
 * and year; the others are left out. */
const inCatalog = (
  db: Connection,
  groups: ReadonlyArray<FilmGroup>,
): Effect.Effect<GroupChoice[], SqliteError> =>
  Effect.gen(function* () {
    const ids = [...new Set(groups.flatMap((g) => g.films))]
    const films = new Map<string, FilmRef>(
      (yield* db.all(FILMS_IN_CATALOG, JSON.stringify(ids))).map((row) => [
        text(row, 'id'),
        {
          id: text(row, 'id'),
          title: text(row, 'titulo'),
          year: numOrNull(row, 'ano'),
        },
      ]),
    )
    return groups.flatMap((group) => {
      const refs = group.films.flatMap((id) => {
        const film = films.get(id)
        return film === undefined ? [] : [film]
      })
      return refs.length === group.films.length
        ? [{ id: group.id, name: group.name, labels: group.labels, films: refs }]
        : []
    })
  })

/** The groups of `ids` that are still in the config and the Catálogo, in
 * the config's order. */
export const groupChoices = (
  db: Connection,
  ids: ReadonlyArray<string>,
): Effect.Effect<GroupChoice[], EngineError | SqliteError, Environment> =>
  Effect.gen(function* () {
    const wanted = new Set(ids)
    return yield* inCatalog(
      db,
      (yield* readFilmGroups).filter((g) => wanted.has(g.id)),
    )
  })

const hasOwnPick = (db: Connection, person: string) =>
  Effect.map(
    db.get('SELECT 1 AS found FROM escolhas_de_grupo WHERE pessoa = ?', person),
    (row) => row !== undefined,
  )

/** The groups to ask `person`, or null when she is not asked: she
 * answered in this Session, has enough Notas of her own or an Escolha de
 * grupo already, or no group is in the Catálogo. */
const questionIn = (
  db: Connection,
  front: YamlMapping,
  person: string,
): Effect.Effect<
  ReadonlyArray<GroupChoice> | null,
  EngineError | SqliteError,
  Environment
> =>
  Effect.gen(function* () {
    const { weights } = yield* Environment
    if (stored(front).some((item) => plain(item).person === person))
      return null
    if (!(yield* hasFewRatings(db, person, weights))) return null
    if (yield* hasOwnPick(db, person)) return null
    const groups = yield* inCatalog(db, yield* readFilmGroups)
    return groups.length === 0 ? null : groups
  })

/** The groups the Link da Sessão asks a Presente of an open Session, or
 * null when it asks none. */
export const groupPickQuestion = (
  request: GroupPickRequest,
): Effect.Effect<
  ReadonlyArray<GroupChoice> | null,
  EngineError | SqliteError,
  Sqlite | Environment
> =>
  Effect.gen(function* () {
    const { frontmatter } = yield* readAttendedSession(
      request.session,
      request.person,
    )
    return yield* (yield* Sqlite).read((db) =>
      questionIn(db, frontmatter, request.person),
    )
  })

const invalid = (message: string) => engineError('invalid_usage', message)

/** Keeps the answer in the Session, waiting for the Dono: up to
 * `MAX_GROUP_PICKS` different groups among those asked, or none. Only
 * while the question is asked, so once per Session. One commit, by the
 * Session's Dono. */
export const answerGroupPick = (
  answer: GroupPickAnswer,
): Effect.Effect<
  { readonly groups: ReadonlyArray<string> },
  EngineError | SqliteError | GitError,
  EngineServices | Run
> =>
  Effect.gen(function* () {
    const { session, person, groups } = answer
    if (new Set(groups).size !== groups.length)
      return yield* invalid('cada grupo só pode ser escolhido uma vez')
    if (groups.length > MAX_GROUP_PICKS)
      return yield* invalid(`escolha até ${MAX_GROUP_PICKS} grupos`)
    const { today } = yield* Run
    const writer = yield* DataWriter
    const author = yield* authorFor(yield* sessionOwner(session))
    return yield* writer.writeFiles(
      { author, message: `group pick ${session} ${person}` },
      (db) =>
        Effect.gen(function* () {
          const { frontmatter, body } = yield* readAttendedSession(
            session,
            person,
          )
          const front = new Map(frontmatter)
          const asked = yield* questionIn(yield* required(db), front, person)
          if (asked === null)
            return yield* invalid(
              `${person} não tem grupos a escolher na Sessão ${session}`,
            )
          const ids = new Set(asked.map((g) => g.id))
          const unknown = groups.find((g) => !ids.has(g))
          if (unknown !== undefined)
            return yield* invalid(
              `o grupo '${unknown}' não está entre os perguntados`,
            )
          const list = stored(front)
          list.push(
            new Map<string, YamlValue>([
              ['person', person],
              ['groups', [...groups]],
              ['date', today],
            ]),
          )
          front.set(KEY, list)
          yield* writeSession(session, front, body)
          return { groups }
        }),
    )
  })

/** Adds an Escolha de grupo to `person` for each group of the waiting
 * answers still in the config and the Catálogo. */
export const addGroupPicks = (
  db: Connection,
  input: {
    readonly person: Person
    readonly groups: ReadonlyArray<string>
    readonly session: string
    readonly today: string
  },
) =>
  Effect.gen(function* () {
    let person = input.person
    let added = 0
    for (const group of yield* groupChoices(db, input.groups)) {
      const result = yield* addItem(person, 'group_picks', {
        date: input.today,
        source: groupPickSource(input.session),
        group: group.id,
        label: group.name,
        films: group.films.map((f) => f.id),
      })
      person = result.person
      added += Number(result.added)
    }
    return { person, added }
  })
