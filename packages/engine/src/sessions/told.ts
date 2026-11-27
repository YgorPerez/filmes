// What a told Session's Feedback says, for the form that corrects it
// (#344): the chosen film and each Presente's reaction, on the 1 to 10 of
// the Já vi.

import { Effect } from 'effect'
import {
  isMapping,
  isPyFloat,
  isPyInt,
  isSequence,
  pyStrValue,
  pyTruthy,
  type YamlValue,
} from '../data/yaml.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import type { EngineServices } from '../runtime/Engine.ts'
import type { ReportLevel } from './facts.ts'
import { isOpen, readSession } from './file.ts'

export interface ToldReaction {
  readonly person: string
  /** Her Nota from 1 to 10; null with a Relato. */
  readonly rating: number | null
  readonly report: ReportLevel | null
  readonly comment: string | null
}

export interface ToldFeedback {
  readonly session: string
  /** The chosen film's IMDb id; null is "não vimos nada". */
  readonly chosen: string | null
  readonly reactions: ReadonlyArray<ToldReaction>
}

const LEVELS: ReadonlySet<YamlValue> = new Set(['liked', 'neutral', 'disliked'])

/** A stored Nota, 0,5 to 5, as a number; null when it is not one. */
const ratingOf = (value: YamlValue | undefined): number | null => {
  if (value === undefined) return null
  if (isPyFloat(value)) return value.float
  if (isPyInt(value)) return Number(value.int)
  return typeof value === 'number' ? value : null
}

const toldReaction = (value: YamlValue): ToldReaction | null => {
  if (!isMapping(value)) return null
  const rating = ratingOf(value.get('rating'))
  const level = value.get('reaction')
  const comment = value.get('comment')
  return {
    person: pyStrValue(value.get('person') ?? null),
    rating:
      value.get('kind') === 'rating' && rating !== null
        ? Math.round(rating * 2)
        : null,
    report:
      value.get('kind') === 'report' && LEVELS.has(level ?? null)
        ? (level as ReportLevel)
        : null,
    comment: typeof comment === 'string' && comment !== '' ? comment : null,
  }
}

/** The Feedback of Session `id`, or null while it is open. */
export const recordedFeedback = (
  id: string,
): Effect.Effect<ToldFeedback | null, EngineError, EngineServices> =>
  Effect.gen(function* () {
    const { frontmatter } = yield* readSession(id)
    if (isOpen(frontmatter)) return null
    const chosen = frontmatter.get('chosen')
    const feedback = frontmatter.get('feedback')
    const list = isMapping(feedback) ? feedback.get('reactions') : null
    return {
      session: id,
      chosen: pyTruthy(chosen) ? pyStrValue(chosen ?? null) : null,
      reactions: isSequence(list)
        ? list.flatMap((r) => toldReaction(r) ?? [])
        : [],
    }
  })
