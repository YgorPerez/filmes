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
import {
  isMapping,
  isSequence,
  pyStrValue,
  pyTruthy,
  yamlToJson,
  type YamlMapping,
  type YamlValue,
} from '../data/yaml.ts'
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
import { Run } from '../runtime/Run.ts'
import type { SqliteError } from '../sqlite/Sqlite.ts'
import { syncSession } from './database.ts'
import { sessionOwner } from './feedback.ts'
import {
  currentVersion,
  isOpen,
  readSession,
  sessionBody,
  sessionRelative,
  VERSION_EXTRAS,
  writeSession,
} from './file.ts'
import {
  authorFor,
  openSession,
  recommendationFields,
  sessionContext,
  type RecommendSessionRequest,
  type SessionRecommendation,
  type SessionRef,
} from './open.ts'

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
): Effect.Effect<
  SessionRef,
  EngineError | SqliteError | GitError,
  EngineServices | Run
> =>
  Effect.gen(function* () {
    const { today } = yield* Run
    const writer = yield* DataWriter
    const author = yield* authorFor(yield* sessionOwner(id))
    return yield* writer.write(
      { author, message: `redo session ${id}` },
      (db) =>
        Effect.gen(function* () {
          const read = yield* openSessionFront(id)
          const front = new Map<string, YamlValue>(read)
          const names = new Map(
            (yield* db.all('SELECT slug, nome FROM pessoas ORDER BY slug')).map(
              (row) => [String(row['slug']), String(row['nome'])],
            ),
          )
          if (swapped.size > 0)
            front.set(
              'swapped',
              [...new Set([...idsOf(front.get('swapped')), ...swapped])].sort(
                (a, b) => compareTuple([a], [b]),
              ),
            )
          const earlier = front.get('versions')
          const versions = [
            ...(pyTruthy(earlier) && isSequence(earlier) ? earlier : []),
            currentVersion(front),
          ]
          for (const field of VERSION_EXTRAS) front.delete(field)
          for (const [key, value] of recommendationFields(
            recommendation,
            context,
          ))
            front.set(key, value)
          front.set('redone_on', today)
          front.set('versions', versions)
          yield* syncSession(db, id, front)
          yield* writeSession(
            id,
            front,
            sessionBody(recommendation.films, names),
          )
          return {
            id,
            file: sessionRelative(id),
            version: versions.length + 1,
          }
        }),
    )
  })

/** `recomendar`: the Recomendação, and the Session it opens or, with
 * `session`, redoes. */
export const recommendSession = (
  request: RecommendSessionRequest,
): Effect.Effect<
  SessionRecommendation,
  EngineError | SqliteError | GitError,
  EngineServices | Run
> =>
  Effect.gen(function* () {
    const count = yield* requestCount(request)
    let keep = requestIds(request.keep)
    if (keep.length > 0 && !request.session)
      return yield* engineError(
        'invalid_usage',
        '--manter só vale com --sessao: são os filmes da versão anterior que ficam',
      )
    const session = request.session || undefined
    let asking: RecommendSessionRequest = request
    let front: YamlMapping | undefined
    if (session !== undefined) {
      front = yield* openSessionFront(session)
      asking = inheritConstraints(asking, storedIn(front))
    }
    const read = (from: RecommendSessionRequest) =>
      Effect.map(readConstraints(from), (asked) => [
        ...asked,
        ...(from.constraints ?? []),
      ])
    let asked: ReadonlyArray<Constraint> = yield* read(asking)
    const warnings: string[] = []
    let regenerate: Regenerate | undefined
    if (session !== undefined && front !== undefined) {
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
        asked = yield* read(asking)
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
      )
      regenerate = prepared.regenerate
      warnings.push(...prepared.warnings)
    }
    const ranked = yield* rankRequest(asking, count, asked, regenerate)
    const recommendation: Recommendation = {
      ...ranked,
      warnings: [...warnings, ...ranked.warnings],
    }
    const context = sessionContext(
      request.request ?? null,
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
          )
        : yield* openSession(recommendation, context)
    return { ...recommendation, session: ref }
  })
