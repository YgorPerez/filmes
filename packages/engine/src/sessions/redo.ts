// `recomendar` in full (`comandos/recomendar.py` `executar`): without
// `session` it opens a Session (`open.ts`); with it, it redoes the
// Recomendação of an open Session (`sessao.refazer`, #45).
//
// A refazer keeps the same file. The previous version goes to the end of
// `versions` (oldest first), with what the Dono swapped from it; the top of
// the frontmatter gets the new request and list, and the body only the new
// Recomendação. A refazer always regenerates: without `keep` no film stays,
// but the "novo" mark and `dropped` still say what came in and what left.
// The Restrições the current version stored carry over where their file
// says so (`inherit`, the similar's references), and a new request that
// replaces the whole list (`replacesList`) ignores `keep`, with a warning.
// So does a request with other Climas than the current version's (#179):
// a Clima only pulls the order, so keeping the screen would keep it all.

import { Effect } from 'effect'
import { compareTuple } from '../compat/compare.ts'
import { DataWriter } from '../data/DataWriter.ts'
import type { GitError } from '../data/git.ts'
import { syncAttendeesTrakt } from '../imports/trakt-sync.ts'
import {
  isMapping,
  isSequence,
  pyStrValue,
  pyTruthy,
  yamlToJson,
  type YamlMapping,
  type YamlValue,
} from '../data/yaml.ts'
import { resolveAttendees } from '../recommendation/attendees.ts'
import type {
  Constraint,
  StoredConstraint,
} from '../recommendation/constraints.ts'
import {
  constraintLabel,
  inheritConstraints,
  readConstraints,
  replacingList,
} from '../recommendation/constraints/index.ts'
import {
  requestIds,
  swappedNow,
} from '../recommendation/constraints/out-of-session.ts'
import { prepareRegenerate, type Regenerate } from '../recommendation/kept.ts'
import { resolveMoods } from '../recommendation/moods.ts'
import {
  rankRequest,
  requestCount,
  type Recommendation,
} from '../recommendation/recommend.ts'
import type { EngineServices } from '../runtime/Engine.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import { Owner } from '../runtime/Owner.ts'
import { Run } from '../runtime/Run.ts'
import { Sqlite, type SqliteError } from '../sqlite/Sqlite.ts'
import { recordBetMarks } from './bet-record.ts'
import { syncSession } from './database.ts'
import { sessionOwner } from './feedback.ts'
import {
  currentVersion,
  isOpen,
  readSession,
  sessionBody,
  sessionRelative,
  shownFilms,
  VERSION_EXTRAS,
  writeSession,
} from './file.ts'
import {
  authorFor,
  nextSessionId,
  openSession,
  recommendationFields,
  sessionContext,
  type RecommendSessionRequest,
  type SessionRecommendation,
  type SessionRef,
} from './open.ts'
import { readRefillComments, refillConstraints } from './refill-comments.ts'
import { sessionRedoRequest } from './redo-request.ts'
import { shortfallOf } from './shortfall.ts'

/** The Session's frontmatter, or an error if it does not exist or already
 * has Feedback (`conferir_aberta`). */
export const openSessionFront = (
  id: string,
): Effect.Effect<YamlMapping, EngineError, Environment> =>
  Effect.gen(function* () {
    const { frontmatter } = yield* readSession(id)
    if (!isOpen(frontmatter))
      return yield* engineError(
        'closed_session',
        `a Sessão ${id} já tem Feedback; recomende sem --sessao para abrir outra`,
      )
    return frontmatter
  })

/** The Restrições the current version stored (`context.constraints`). */
/** The Dono's words the current version kept: a refazer without words of
 * its own carries them on, so the Cartaz keeps her note (#277). */
const storedRequest = (front: YamlMapping): string | null => {
  const context = front.get('context')
  const request =
    pyTruthy(context) && isMapping(context) ? context.get('request') : undefined
  return request !== undefined && pyTruthy(request) ? pyStrValue(request) : null
}

const storedIn = (front: YamlMapping): ReadonlyArray<StoredConstraint> => {
  const context = front.get('context')
  const list =
    pyTruthy(context) && isMapping(context)
      ? context.get('constraints')
      : undefined
  return pyTruthy(list) && isSequence(list)
    ? list.filter(isMapping).map((item) => yamlToJson(item) as StoredConstraint)
    : []
}

const idsOf = (value: YamlValue | undefined): string[] =>
  pyTruthy(value) && isSequence(value) ? value.map((v) => pyStrValue(v)) : []

/** Whether `asked` are other Climas than the current version's: by name,
 * in any order or case. */
const otherMoods = (
  front: YamlMapping,
  asked: ReadonlyArray<string> | undefined,
): Effect.Effect<boolean, EngineError, Environment> =>
  Effect.gen(function* () {
    const context = front.get('context')
    const stored = isMapping(context) ? context.get('moods') : undefined
    const before = new Set(idsOf(stored))
    const names = (yield* resolveMoods(asked ?? [])).moods.map((m) => m.name)
    return names.length !== before.size || names.some((n) => !before.has(n))
  })

/** The frontmatter after the refazer: the version that leaves goes to the
 * end of `versions`, and the top gets the new request and list. Returns
 * the new version's number. */
const redoFront = (
  front: Map<string, YamlValue>,
  input: {
    readonly recommendation: Recommendation
    readonly context: YamlValue
    readonly swapped: ReadonlySet<string>
    readonly explicitSwaps: ReadonlyArray<string>
    readonly owner: string | undefined
    readonly today: string
  },
): number => {
  const { recommendation, context, swapped, explicitSwaps, owner, today } =
    input
  const previousSwaps = idsOf(front.get('swapped'))
  const [explicitSwap] = explicitSwaps
  if (owner !== undefined && explicitSwap && explicitSwaps.length === 1)
    recordBetMarks(front, [
      {
        person: owner,
        film: explicitSwap,
        kind: 'swapped',
        rating: null,
        date: today,
      },
    ])
  if (swapped.size > 0)
    front.set(
      'swapped',
      [...new Set([...previousSwaps, ...swapped])].sort((a, b) =>
        compareTuple([a], [b]),
      ),
    )
  const earlier = front.get('versions')
  const versions = [
    ...(pyTruthy(earlier) && isSequence(earlier) ? earlier : []),
    currentVersion(front),
  ]
  for (const field of VERSION_EXTRAS) front.delete(field)
  front.delete('refill_comments')
  for (const [key, value] of recommendationFields(recommendation, context))
    front.set(key, value)
  front.set('redone_on', today)
  front.set('versions', versions)
  return versions.length + 1
}

/** Puts the new Recomendação in an open Session, in the same file
 * (`sessao.refazer`): the version that leaves goes to the end of
 * `versions`, with `swapped` added to its own (what the Dono swapped from
 * its screen); the body has only the new Recomendação. The id does not
 * change, even when the Presentes do. */
export const redoSession = (
  id: string,
  recommendation: Recommendation,
  context: YamlValue,
  swapped: ReadonlySet<string>,
  explicitSwaps: ReadonlyArray<string>,
  expectedVersion?: number,
): Effect.Effect<
  SessionRef,
  EngineError | SqliteError | GitError,
  EngineServices | Run
> =>
  Effect.gen(function* () {
    const { today } = yield* Run
    const writer = yield* DataWriter
    const owner = yield* sessionOwner(id)
    const author = yield* authorFor(owner)
    return yield* writer.write(
      { author, message: `redo session ${id}` },
      (db) =>
        Effect.gen(function* () {
          const read = yield* openSessionFront(id)
          if (
            expectedVersion !== undefined &&
            Number(yamlToJson(currentVersion(read).get('version') ?? null)) !==
              expectedVersion
          )
            return yield* engineError(
              'invalid_usage',
              'a Sessão mudou; tente de novo',
            )
          const front = new Map<string, YamlValue>(read)
          const names = new Map(
            (yield* db.all('SELECT slug, nome FROM pessoas ORDER BY slug')).map(
              (row) => [String(row['slug']), String(row['nome'])],
            ),
          )
          const version = redoFront(front, {
            recommendation,
            context,
            swapped,
            explicitSwaps,
            owner,
            today,
          })
          yield* syncSession(db, id, front)
          yield* writeSession(
            id,
            front,
            sessionBody(recommendation.films, names),
          )
          return { id, file: sessionRelative(id), version }
        }),
    )
  })

/** The Restrições a request asks, its own and the ones it reads. */
const readAsked = (from: RecommendSessionRequest) =>
  Effect.map(readConstraints(from), (asked) => [
    ...asked,
    ...(from.constraints ?? []),
  ])

/** What a refazer regenerates from the open Session. A request that
 * replaces the whole list, or with other Climas, ignores `keep`, with a
 * warning, and its Restrições are read again without it. */
const prepareRedo = (
  front: YamlMapping,
  start: {
    readonly keep: ReadonlyArray<string>
    readonly asking: RecommendSessionRequest
    readonly asked: ReadonlyArray<Constraint>
    readonly preservePositions: boolean
  },
) =>
  Effect.gen(function* () {
    let { keep, asking, asked } = start
    const warnings: string[] = []
    // A refazer always regenerates: without `keep` no film stays, but the
    // "novo" mark and `dropped` still say what came in and what left.
    let replacing: Constraint | undefined = replacingList(
      asked,
      storedIn(front),
    )[0]
    const newMood = yield* otherMoods(front, asking.moods)
    if ((replacing !== undefined || newMood) && keep.length > 0) {
      const why =
        replacing === undefined
          ? 'o Clima novo'
          : (constraintLabel(replacing.stored()) ?? '')
      warnings.push(
        `--manter ${keep.join(',')}: ignorado, ${why} troca a lista inteira`,
      )
      keep = []
      asking = { ...asking, keep: undefined }
      asked = yield* readAsked(asking)
      const name = replacing?.name
      replacing = asked.find((c) => c.name === name)
    }
    const swapped = swappedNow(
      currentVersion(front),
      keep,
      requestIds(asking.swap),
    )
    const prepared = prepareRegenerate(
      front,
      keep,
      swapped,
      replacing,
      newMood,
      start.preservePositions,
    )
    warnings.push(...prepared.warnings)
    return { asking, asked, regenerate: prepared.regenerate, warnings }
  })

/** How many films the current version shows: a refazer without a count
 * keeps it (map #355), so swapping 4 of 9 gives back 9. */
const sizeOf = (front: YamlMapping): number | undefined => {
  const films = front.get('recommendation')
  return isSequence(films) && films.length > 0 ? films.length : undefined
}

/** The request as the Session asks it: with the Restrições its current
 * version passes on and, in a refazer, what it regenerates. */
const sessionRequest = (
  request: RecommendSessionRequest,
  session: string | undefined,
  keep: ReadonlyArray<string>,
  preservePositions: boolean,
): Effect.Effect<
  {
    readonly asking: RecommendSessionRequest
    readonly asked: ReadonlyArray<Constraint>
    readonly regenerate: Regenerate | undefined
    readonly warnings: ReadonlyArray<string>
    readonly refillMoods?: ReadonlyArray<string>
    readonly refillOnly?: ReadonlyArray<Constraint>
  },
  EngineError | SqliteError,
  EngineServices
> =>
  Effect.gen(function* () {
    if (session === undefined)
      return {
        asking: request,
        asked: yield* readAsked(request),
        regenerate: undefined,
        warnings: [],
      }
    const front = yield* openSessionFront(session)
    const asking = inheritConstraints(
      {
        ...request,
        request: request.request ?? storedRequest(front),
        count: request.count ?? sizeOf(front),
      },
      storedIn(front),
    )
    const asked = yield* readAsked(asking)
    const redo = yield* prepareRedo(front, {
      keep,
      asking,
      asked,
      preservePositions,
    })
    const comments = request.refillComments
    if (!comments?.length) return redo
    const read = yield* readRefillComments(comments)
    return {
      ...redo,
      refillMoods: read.moods ?? [],
      refillOnly: yield* refillConstraints(read, redo.regenerate),
    }
  })

/** `recomendar`: the Recomendação, and the Session it opens or, with
 * `session`, redoes. */
const recommendInSession = (
  request: RecommendSessionRequest,
  expectedVersion?: number,
): Effect.Effect<
  SessionRecommendation,
  EngineError | SqliteError | GitError,
  EngineServices | Run
> =>
  Effect.gen(function* () {
    const requested = yield* requestCount(request)
    const keep = requestIds(request.keep)
    if (keep.length > 0 && !request.session)
      return yield* engineError(
        'invalid_usage',
        '--manter só vale com --sessao: são os filmes da versão anterior que ficam',
      )
    const session = request.session || undefined
    // A new Session reads the Presentes' Trakt first (#269).
    const synced =
      session === undefined
        ? yield* syncAttendeesTrakt(
            request.attendees ?? [],
            yield* authorFor((yield* Owner) ?? undefined),
          )
        : []
    const { asking, asked, regenerate, warnings, refillMoods, refillOnly } =
      yield* sessionRequest(
        request,
        session,
        keep,
        expectedVersion !== undefined,
      )
    const count = asking.count ?? requested
    // The Aposta's draws come from the Session id (#178).
    const rankedWithRelaxed = yield* rankRequest(
      {
        ...asking,
        ...(refillMoods !== undefined && { refillMoods }),
        relax: true,
      },
      count,
      refillOnly === undefined ? asked : [...asked, ...refillOnly],
      regenerate,
      session !== undefined
        ? () => Effect.succeed(session)
        : (db, attendees) => nextSessionId(db, attendees),
    )
    const { relaxed, ...ranked } = rankedWithRelaxed
    const shortfall = shortfallOf(ranked, count, relaxed)
    const recommendation: Omit<SessionRecommendation, 'session'> = {
      ...ranked,
      warnings: [...synced, ...warnings, ...ranked.warnings],
      ...(shortfall && { shortfall }),
    }
    const context = sessionContext(
      asking.request ?? null,
      recommendation.moods,
      asked,
    )
    const ref =
      session !== undefined && regenerate !== undefined
        ? yield* redoSession(
            session,
            recommendation,
            context,
            regenerate.swapped,
            requestIds(asking.swap),
            expectedVersion,
          )
        : yield* openSession(recommendation, context)
    return { ...recommendation, session: ref }
  })

export const recommendSession = (request: RecommendSessionRequest) =>
  recommendInSession(request)

/** Recommends for a new group, keeping every film on the current screen
 * that still passes. Only a Dono of the current group may edit it. */
export const editSessionAttendees = (
  id: string,
  people: ReadonlyArray<string>,
) =>
  Effect.gen(function* () {
    const front = yield* openSessionFront(id)
    const owner = yield* Owner
    if (owner === null || !idsOf(front.get('attendees')).includes(owner))
      return yield* engineError(
        'invalid_usage',
        'só um Dono entre os Presentes pode editar a Sessão',
      )
    if (people.length === 0)
      return yield* engineError(
        'invalid_usage',
        'informe pelo menos um Presente',
      )
    const attendees = yield* (yield* Sqlite).read((db) =>
      resolveAttendees(db, people),
    )
    const request = yield* sessionRedoRequest(id)
    const version = currentVersion(front)
    return yield* recommendInSession(
      {
        ...request,
        attendees,
        ...(request.by !== undefined &&
          !attendees.includes(request.by) && {
            rule: 'default' as const,
            by: undefined,
          }),
        keep: shownFilms(version).map((film) => film.id),
      },
      Number(yamlToJson(version.get('version') ?? null)),
    )
  })
