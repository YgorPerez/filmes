// The Votos of the group swipe (#182): each Presente says yes or no to the
// films of the screen, one at a time, on the Link da Sessão.
//
// - The Votos go in `votes` of the current version. For the count, each
//   Presente's latest submission replaces her earlier votes (#205).
// - A no is a Trocar from that Presente: the film goes in `swapped` of the
//   current version and never comes back in the Session (#66).
// - A yes lifts the film: the kept films with more yes in the Session come
//   first, at the numbers the kept films had. A changed order calls for a
//   redo even when every film stays (#205).
// - A film no longer on the current screen is skipped, with a warning: the
//   deck was of an older version and another Presente's no redid it.
// - Votos are no Fato: no Nota, no Declarado, nothing about taste.
//
// It regenerates nothing. Like the Cartaz's reply (`answerBillboard`), it
// returns `regenerate`, `keep` and `dropped`, and whoever asked redoes the
// Session with `recommendSession({ session, keep })`.

import { Effect } from 'effect'
import { compareTuple } from '../compat/compare.ts'
import { DataWriter } from '../data/DataWriter.ts'
import type { GitError } from '../data/git.ts'
import {
  isMapping,
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
import type { SqliteError } from '../sqlite/Sqlite.ts'
import { sessionOwner } from './feedback.ts'
import {
  currentVersion,
  isOpen,
  readSession,
  sessionRelative,
  shownFilms,
  writeSession,
  type ShownFilm,
} from './file.ts'
import { authorFor } from './open.ts'

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
}

export interface CastVotes {
  readonly session: { readonly id: string; readonly file: string }
  readonly version: number
  readonly currentVersion: number
  /** A film was swapped or the yes votes changed the screen's order. */
  readonly regenerate: boolean
  /** The ids that stay, in the current screen's order. */
  readonly keep: ReadonlyArray<string>
  /** What left the current screen: each no is `swapped`. */
  readonly dropped: ReadonlyArray<ShownFilm & DropCause>
  readonly warnings: ReadonlyArray<string>
}

const invalid = (message: string) => engineError('invalid_usage', message)

const listOf = (value: YamlValue | undefined): ReadonlyArray<YamlValue> =>
  pyTruthy(value) && isSequence(value) ? value : []

/** A Voto as the Session keeps it. */
interface StoredVote {
  readonly person: string
  readonly film: string
  readonly vote: VoteValue
  /** The first Voto of a submission. Legacy votes have no boundary. */
  readonly replaces?: boolean
}

const storedVotes = (version: YamlMapping): StoredVote[] =>
  listOf(version.get('votes'))
    .filter(isMapping)
    .map((item) => yamlToJson(item) as unknown as StoredVote)

/** The Votos of every version of the Session, oldest first. */
const sessionVotes = (front: YamlMapping): StoredVote[] =>
  [
    ...listOf(front.get('versions')).filter(isMapping),
    currentVersion(front),
  ].flatMap(storedVotes)

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

/** Film → how many Presentes said yes in their latest submission. Legacy
 * votes were saved by film, with no way to tell submissions apart. */
export const yesVotes = (front: YamlMapping): ReadonlyMap<string, number> => {
  const latest = new Map<string, Map<string, VoteValue>>()
  for (const { person, film, vote, replaces } of sessionVotes(front)) {
    const votes = (replaces ? undefined : latest.get(person)) ?? new Map()
    votes.set(film, vote)
    latest.set(person, votes)
  }
  const count = new Map<string, number>()
  for (const votes of latest.values())
    for (const [film, vote] of votes)
      if (vote === 'yes') count.set(film, (count.get(film) ?? 0) + 1)
  return count
}

/** Most yes votes first. Ties keep the given screen order. */
export const orderByYes = (
  films: ReadonlyArray<string>,
  yes: ReadonlyMap<string, number>,
): string[] => films.toSorted((a, b) => (yes.get(b) ?? 0) - (yes.get(a) ?? 0))

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
    const author = yield* authorFor(yield* sessionOwner(id))
    return yield* writer.writeFiles(
      { author, message: `vote session ${id}` },
      () =>
        Effect.gen(function* () {
          const session = yield* readSession(id).pipe(
            Effect.catchIf(
              (e) => e.code === 'unknown_session',
              (e) => invalid(e.message),
            ),
          )
          const front = new Map<string, YamlValue>(session.frontmatter)
          if (!isOpen(front))
            return yield* engineError(
              'closed_session',
              `a Sessão ${id} já tem Feedback; o Voto não vale mais`,
            )
          const current = currentVersion(front)
          const currentNumber = listOf(front.get('versions')).length + 1
          if (!(request.version >= 1 && request.version <= currentNumber))
            return yield* invalid(
              `a Sessão ${id} não tem a versão ${request.version}`,
            )
          const attendees = listOf(current.get('attendees')).map((v) =>
            pyStrValue(v),
          )
          if (!attendees.includes(request.person))
            return yield* invalid(
              `${request.person} não está entre os Presentes da Sessão ${id}`,
            )

          const screen = shownFilms(current)
          const onScreen = new Set(screen.map((f) => f.id))
          const warnings: string[] = []
          const cast = new Map<string, VoteValue>()
          for (const { film, vote } of request.votes)
            if (onScreen.has(film)) cast.set(film, vote)
            else
              warnings.push(
                `voto em ${film} ignorado: o filme não está mais na tela da versão ${currentNumber}`,
              )

          if (cast.size > 0) {
            front.set('votes', [
              ...listOf(front.get('votes')),
              ...[...cast].map(
                ([film, vote], i) =>
                  new Map<string, YamlValue>([
                    ['person', request.person],
                    ['film', film],
                    ['vote', vote],
                    ['date', today],
                    ...(i === 0 ? ([['replaces', true]] as const) : []),
                  ]),
              ),
            ])
            const no = [...cast].filter(([, v]) => v === 'no').map(([f]) => f)
            if (no.length > 0) {
              const swapped = listOf(front.get('swapped')).map(pyStrValue)
              front.set(
                'swapped',
                [...new Set([...swapped, ...no])].sort((a, b) =>
                  compareTuple([a], [b]),
                ),
              )
            }
            yield* writeSession(id, front, session.body)
          }

          const dropped: Array<ShownFilm & DropCause> = []
          const keep: string[] = []
          // What this version swapped before stays out too: a redo that
          // failed after an earlier no is done now.
          const out = new Set(listOf(front.get('swapped')).map(pyStrValue))
          for (const film of screen)
            if (out.has(film.id)) dropped.push({ ...film, cause: 'swapped' })
            else keep.push(film.id)
          const reordered = orderByYes(keep, yesVotes(front)).some(
            (id, i) => id !== keep[i],
          )
          return {
            session: { id, file: sessionRelative(id) },
            version: request.version,
            currentVersion: currentNumber,
            regenerate: dropped.length > 0 || reordered,
            keep,
            dropped,
            warnings,
          }
        }),
    )
  })
