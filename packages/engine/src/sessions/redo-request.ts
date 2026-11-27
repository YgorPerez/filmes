// The request that redoes a Session as its current version asked: what the
// app's Cartaz (#114) regenerates with after a reply (`answerBillboard`
// says `regenerate`), adding only `keep`. No Python twin: in the chat,
// Claude repeats the flags itself.
//
// It reads the current version: the Presentes, the Regra, the Climas, the
// words, the maximum duration and each stored Restrição back into its
// request field. Three stored Restrições are not repeated, because the
// refazer brings them itself: the similar and the Série na ordem
// (`inherit`) and the out of session (on with any `session`). A stored Restrição with no field (the
// legacy no_repeat) is left out, as the Cartaz's top leaves it out. The
// count is the size of the current Recomendação, so the screen keeps its
// size.

import { Effect } from 'effect'
import {
  isMapping,
  isSequence,
  pyStrValue,
  pyTruthy,
  yamlToJson,
  type YamlValue,
} from '../data/yaml.ts'
import type { StoredConstraint } from '../recommendation/constraints.ts'
import type { RuleName } from '../recommendation/rule.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import { readSession } from './file.ts'
import type { RecommendSessionRequest } from './open.ts'

type Mutable<T> = { -readonly [K in keyof T]: T[K] }

const json = (value: YamlValue | undefined): unknown =>
  value === undefined ? undefined : yamlToJson(value)

const get = (map: YamlValue | undefined, key: string) =>
  isMapping(map) ? map.get(key) : undefined

const texts = (value: YamlValue | undefined): string[] =>
  value !== undefined && pyTruthy(value) && isSequence(value)
    ? value.map((v) => pyStrValue(v))
    : []

const numberOr = (value: unknown): number | undefined =>
  typeof value === 'number' ? value : undefined

/** One stored Restrição back into its request field. */
const fromStored = (
  request: Mutable<RecommendSessionRequest>,
  stored: StoredConstraint & Record<string, unknown>,
): void => {
  switch (stored.name) {
    case 'year':
      request.since = numberOr(stored['since'])
      request.until = numberOr(stored['until'])
      break
    case 'child':
      request.child = Number(stored['age'])
      break
    case 'language':
      request.language = String(stored['language'])
      break
    case 'trigger':
      request.triggers = (stored['themes'] as unknown[]).map(String)
      break
    case 'unseen':
      request.unseen = true
      break
    case 'no_slow':
      request.noSlow = true
      break
    case 'no_sad':
      request.noSad = true
      break
    case 'no_mood':
      request.noMoods = (stored['moods'] as unknown[]).map(String)
      break
  }
}

/** The request that redoes Session `id` as its current version asked;
 * `keep` and `swap` are the caller's. */
export const sessionRedoRequest = (
  id: string,
): Effect.Effect<RecommendSessionRequest, EngineError, Environment> =>
  Effect.gen(function* () {
    const { frontmatter: front } = yield* readSession(id)
    const context = front.get('context')
    const rule = front.get('rule')
    const request: Mutable<RecommendSessionRequest> = {
      attendees: texts(front.get('attendees')),
      session: id,
      moods: texts(get(context, 'moods')),
    }
    const name = json(get(rule, 'name'))
    if (name === 'average' || name === 'by') request.rule = name as RuleName
    if (name === 'by') request.by = String(json(get(rule, 'person')))
    const films = front.get('recommendation')
    if (isSequence(films) && films.length > 0) request.count = films.length
    const words = json(get(context, 'request'))
    if (typeof words === 'string') request.request = words
    const max = numberOr(json(get(context, 'max_duration')))
    if (max !== undefined) request.maxDuration = max
    const stored = json(get(context, 'constraints'))
    for (const item of Array.isArray(stored) ? stored : [])
      fromStored(request, item as StoredConstraint & Record<string, unknown>)
    return request
  })
