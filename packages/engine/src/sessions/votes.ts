// The Votos of the group swipe (#182): each Presente says yes or no to the
// films of the screen, one at a time, on the Link da Sessão.
//
// - The Votos go in `votes` of the current version. For the count, each
//   Presente's latest submission replaces her earlier votes (#205).
// - A no is a Trocar from that Presente: the film goes in `swapped` of the
//   current version and never comes back in the Session (#66).
// - After the deck, each Presente may send her Ordem (#379): her yes films
//   in the order she wants them, kept with her latest submission. The
//   kept films go by the lowest sum of positions over the Presentes who
//   ranked, at the numbers the kept films had; a film a ranker has not
//   placed counts as the middle of her list. Ties, or nobody ranked yet:
//   the Regra de escolha (the redo breaks them). A changed order calls
//   for a redo even when every film stays (#205), and so does a new Ordem
//   that leaves a tie for the Regra to break.
// - A film no longer on the current screen is skipped, with a warning: the
//   deck was of an older version and another Presente's no redid it.
// - Votos are no Fato: no Nota, no Declarado, nothing about taste.
// - The same submission carries the Presente's Vi e gostei / Vi e não
//   gostei (`seen`, `seen-gestures.ts`), which are no Voto: the film leaves
//   as a Já vi, and her taste is written now (the Session's Dono) or after
//   the Dono's yes (a guest). A gesture wins over a Voto on the same film.
//
// It regenerates nothing. Like the Cartaz's reply (`answerBillboard`), it
// returns `regenerate`, `keep` and `dropped`, and whoever asked redoes the
// Session with `recommendSession({ session, keep })`.

import { Effect, Schema } from 'effect'
import { compareTuple } from '../compat/compare.ts'
import { DataWriter } from '../data/DataWriter.ts'
import type { GitError } from '../data/git.ts'
import {
  isSequence,
  pyStrValue,
  pyTruthy,
  yamlToJson,
  type YamlMapping,
  type YamlValue,
} from '../data/yaml.ts'
import type { DropCause } from '../recommendation/kept.ts'
import type { EngineServices } from '../runtime/Engine.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { Run } from '../runtime/Run.ts'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'
import { sessionOwner } from './feedback.ts'
import {
  currentVersion,
  sessionVersions,
  readOpenSession,
  sessionRelative,
  shownFilms,
  writeSession,
  type ShownFilm,
} from './file.ts'
import { authorFor } from './open.ts'
import { resolvePerson } from '../people/people.ts'
import {
  addGestures,
  gesturedFilms,
  recordGestures,
  type SeenGesture,
} from './seen-gestures.ts'

/** A Presente's answer to one film. */
export type VoteValue = 'yes' | 'no'

export interface CastVotesRequest {
  /** The Session's id. */
  readonly session: string
  /** The Presente who votes (a slug). */
  readonly person: string
  /** The version whose screen the Presente saw. */
  readonly version: number
  readonly votes: ReadonlyArray<{
    readonly film: string
    readonly vote: VoteValue
  }>
  /** Her Vi e gostei / Vi e não gostei on films of the screen (#378). */
  readonly seen?: ReadonlyArray<SeenGesture>
  /** Her Ordem (#379): her yes films, the one she wants most first. Only
   * films she says yes to in this submission count. */
  readonly ranking?: ReadonlyArray<string>
}

export interface CastVotes {
  readonly session: { readonly id: string; readonly file: string }
  readonly version: number
  readonly currentVersion: number
  /** A film was swapped or the yes votes changed the screen's order. */
  readonly regenerate: boolean
  /** The ids that stay, in the current screen's order. */
  readonly keep: ReadonlyArray<string>
  /** What left the current screen: each no is `swapped`, each Vi e
   * gostei / Vi e não gostei is `seen`. */
  readonly dropped: ReadonlyArray<ShownFilm & DropCause>
  readonly warnings: ReadonlyArray<string>
}

const invalid = (message: string) => engineError('invalid_usage', message)

const listOf = (value: YamlValue | undefined): ReadonlyArray<YamlValue> =>
  pyTruthy(value) && isSequence(value) ? value : []

/** A Voto as the Session keeps it. Legacy votes have no submission boundary. */
const StoredVote = Schema.Struct({
  person: Schema.String,
  film: Schema.String,
  vote: Schema.Literals(['yes', 'no']),
  date: Schema.optionalKey(Schema.String),
  replaces: Schema.optionalKey(Schema.Boolean),
  /** The Ordem of the submission this Voto opens (#379). */
  ranking: Schema.optionalKey(Schema.Array(Schema.String)),
})
type StoredVote = typeof StoredVote.Type
const isStoredVote = Schema.is(StoredVote)

export const storedVotes = (version: YamlMapping): StoredVote[] =>
  listOf(version.get('votes')).map(yamlToJson).filter(isStoredVote)

/** The Votos of every version of the Session, oldest first. */
const sessionVotes = (front: YamlMapping): StoredVote[] =>
  sessionVersions(front).flatMap(storedVotes)

/** The films `person` already voted on in the Session, in any version. */
export const votedBy = (
  front: YamlMapping,
  person: string,
): ReadonlySet<string> =>
  new Set(
    sessionVotes(front)
      .filter((v) => v.person === person)
      .map((v) => v.film),
  )

/** `person`'s standing Votos: her latest submission, film by film (#275). */
export const latestVotes = (
  front: YamlMapping,
  person: string,
): ReadonlyMap<string, VoteValue> => {
  let votes = new Map<string, VoteValue>()
  for (const { person: who, film, vote, replaces } of sessionVotes(front)) {
    if (who !== person) continue
    if (replaces) votes = new Map()
    votes.set(film, vote)
  }
  return votes
}

/** The films of the current screen that came in after `person`'s last
 * Voto in the Session: none shown in or before the version her last
 * submission went to. Before her first Voto nothing is new to her (#380).
 * A film that left and came back is not new. */
export const newSinceVote = (
  front: YamlMapping,
  person: string,
): ReadonlySet<string> => {
  const versions = sessionVersions(front)
  const last = versions.findLastIndex((version) =>
    storedVotes(version).some((v) => v.person === person),
  )
  if (last < 0) return new Set()
  const seen = new Set(
    versions.slice(0, last + 1).flatMap((v) => shownFilms(v).map((f) => f.id)),
  )
  return new Set(
    shownFilms(currentVersion(front))
      .map((f) => f.id)
      .filter((id) => !seen.has(id)),
  )
}

/** `person`'s Ordem (#379): the one of her latest submission, or null when
 * that submission had none. */
export const latestRanking = (
  front: YamlMapping,
  person: string,
): ReadonlyArray<string> | null => {
  let ranking: ReadonlyArray<string> | null = null
  for (const vote of sessionVotes(front))
    if (vote.person === person && vote.replaces) ranking = vote.ranking ?? null
  return ranking
}

/** Film → the sum of its positions over the Presentes who ranked, for
 * `films` (#379). Each Ordem counts only its films among `films`, from 1;
 * a film she has not placed counts as the middle of her list. Undefined
 * when nobody ranked any of them. */
export const rankSums = (
  front: YamlMapping,
  films: ReadonlyArray<string>,
): ReadonlyMap<string, number> | undefined => {
  const people = new Set(sessionVotes(front).map((v) => v.person))
  const orders = [...people]
    .map((person) => latestRanking(front, person) ?? [])
    .map((ranking) => ranking.filter((film) => films.includes(film)))
    .filter((ranking) => ranking.length > 0)
  if (orders.length === 0) return undefined
  return new Map(
    films.map((film) => [
      film,
      orders.reduce((sum, ranking) => {
        const at = ranking.indexOf(film)
        return sum + (at === -1 ? (ranking.length + 1) / 2 : at + 1)
      }, 0),
    ]),
  )
}

/** Lowest sum first. Ties keep the given order. */
export const orderByRanking = <A>(
  items: ReadonlyArray<A>,
  sums: ReadonlyMap<string, number>,
  idOf: (item: A) => string,
): A[] =>
  items.toSorted((a, b) => (sums.get(idOf(a)) ?? 0) - (sums.get(idOf(b)) ?? 0))

const hasTie = (sums: ReadonlyMap<string, number>): boolean =>
  new Set(sums.values()).size < sums.size

/** Reads the Session the Votos are for: open, with the version asked and
 * `person` among its Presentes. */
const openForVotes = (request: CastVotesRequest) =>
  Effect.gen(function* () {
    const id = request.session
    const { session, front } = yield* readOpenSession(
      id,
      'o Voto não vale mais',
    )
    const current = currentVersion(front)
    const currentNumber = listOf(front.get('versions')).length + 1
    if (!(request.version >= 1 && request.version <= currentNumber))
      return yield* invalid(
        `a Sessão ${id} não tem a versão ${request.version}`,
      )
    const attendees = listOf(current.get('attendees')).map((v) => pyStrValue(v))
    if (!attendees.includes(request.person))
      return yield* invalid(
        `${request.person} não está entre os Presentes da Sessão ${id}`,
      )
    return { session, front, current, currentNumber }
  })

/** Adds the Votos cast to `front`, a no as a Trocado, and her Ordem on
 * the submission's first Voto. */
const addVotes = (
  front: Map<string, YamlValue>,
  person: string,
  cast: ReadonlyMap<string, VoteValue>,
  ranking: ReadonlyArray<string>,
  today: string,
): void => {
  front.set('votes', [
    ...listOf(front.get('votes')),
    ...[...cast].map(
      ([film, vote], i) =>
        new Map<string, YamlValue>([
          ['person', person],
          ['film', film],
          ['vote', vote],
          ['date', today],
          ...(i === 0 ? ([['replaces', true]] as const) : []),
          ...(i === 0 && ranking.length > 0
            ? ([['ranking', [...ranking]]] as const)
            : []),
        ]),
    ),
  ])
  const no = [...cast].filter(([, v]) => v === 'no').map(([f]) => f)
  if (no.length > 0) {
    const swapped = listOf(front.get('swapped')).map(pyStrValue)
    front.set(
      'swapped',
      [...new Set([...swapped, ...no])].sort((a, b) => compareTuple([a], [b])),
    )
  }
}

/** The Votos and gestures of the request on the current screen; the
 * others are warned about. A gesture wins over a Voto on the same film. */
const onTheScreen = (
  request: CastVotesRequest,
  screen: ReadonlyArray<ShownFilm>,
  currentNumber: number,
) => {
  const onScreen = new Set(screen.map((f) => f.id))
  const warnings: string[] = []
  const off = (what: string, film: string) =>
    warnings.push(
      `${what} ${film} ignorado: o filme não está mais na tela da versão ${currentNumber}`,
    )
  const seen = new Map<string, SeenGesture>()
  for (const gesture of request.seen ?? [])
    if (onScreen.has(gesture.film)) seen.set(gesture.film, gesture)
    else off('vi', gesture.film)
  const cast = new Map<string, VoteValue>()
  for (const { film, vote } of request.votes)
    if (!onScreen.has(film)) off('voto em', film)
    else if (!seen.has(film)) cast.set(film, vote)
  return { cast, seen: [...seen.values()], warnings }
}

/** What leaves the current screen and what stays, in its order. */
const leaving = (front: YamlMapping, screen: ReadonlyArray<ShownFilm>) => {
  const dropped: Array<ShownFilm & DropCause> = []
  const keep: string[] = []
  // What this version swapped or saw before stays out too: a redo that
  // failed after an earlier no is done now.
  const out = new Set(listOf(front.get('swapped')).map(pyStrValue))
  const gestured = gesturedFilms(front)
  for (const film of screen) {
    const people = gestured.get(film.id)
    if (people !== undefined) dropped.push({ ...film, cause: 'seen', people })
    else if (out.has(film.id)) dropped.push({ ...film, cause: 'swapped' })
    else keep.push(film.id)
  }
  return { dropped, keep }
}

/** Records the Votos and gestures inside the write. `owner` is the
 * Session's Dono, whose gestures go into her file now. */
const recordVotes = (
  db: Connection | null,
  request: CastVotesRequest,
  today: string,
  owner: string | undefined,
) =>
  Effect.gen(function* () {
    const id = request.session
    const { session, front, current, currentNumber } =
      yield* openForVotes(request)

    const screen = shownFilms(current)
    const { cast, seen, warnings } = onTheScreen(request, screen, currentNumber)
    const byOwner = request.person === owner
    if (byOwner && seen.length > 0)
      yield* recordGestures(db, {
        person: yield* resolvePerson(request.person),
        gestures: seen,
        session: id,
        today,
      })
    addGestures(front, request.person, seen, today, byOwner ? today : null)
    const ranking = [
      ...new Set(
        (request.ranking ?? []).filter((film) => cast.get(film) === 'yes'),
      ),
    ]
    const before = latestRanking(front, request.person) ?? []
    if (cast.size > 0) addVotes(front, request.person, cast, ranking, today)
    if (cast.size > 0 || seen.length > 0)
      yield* writeSession(id, front, session.body)

    const { dropped, keep } = leaving(front, screen)
    const sums = rankSums(front, keep)
    const reordered =
      sums !== undefined &&
      (orderByRanking(keep, sums, (film) => film).some(
        (film, i) => film !== keep[i],
      ) ||
        // Only the redo knows the Regra that breaks a tie.
        (hasTie(sums) && cast.size > 0 && ranking.join() !== before.join()))
    const result: CastVotes = {
      session: { id, file: sessionRelative(id) },
      version: request.version,
      currentVersion: currentNumber,
      regenerate: dropped.length > 0 || reordered,
      keep,
      dropped,
      warnings,
    }
    return result
  })

/** Records a Presente's Votos on the current screen and says whether the
 * Session must be regenerated and what stays. One commit. */
export const castVotes = (
  request: CastVotesRequest,
): Effect.Effect<
  CastVotes,
  EngineError | SqliteError | GitError,
  EngineServices | Run
> =>
  Effect.gen(function* () {
    const id = request.session
    const { today } = yield* Run
    const writer = yield* DataWriter
    const owner = yield* sessionOwner(id)
    const author = yield* authorFor(owner)
    return yield* writer.writeFiles(
      { author, message: `vote session ${id}` },
      (db) => recordVotes(db, request, today, owner),
    )
  })
