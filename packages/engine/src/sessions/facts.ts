// The Fatos a Session's Feedback gives, read from its frontmatter
// (`sessao/fatos.py`):
//
// - each reaction is a Fato, with the Session as its Fonte and the
//   Feedback's date; a Nota (the Dono's, or one he relays) also goes to
//   `notas`, with the same fato_id;
// - each Presente gets the Já visto of the chosen film, reaction or not;
// - a reaction's comment is a specific Declarado of that Pessoa about the
//   chosen film, liking it from 7 to 10 (out of 10), disliking from 1 to 4,
//   neutral between; it gives no Nota;
// - "não vimos nada" (a Feedback with no chosen film) gives no Fato.
//
// The file is English; the database and the fato_ids keep Python's
// Portuguese values (`nota`, `gostou`, `gosta`), so a rebuild by either
// engine gives the same ids.

import { Effect } from 'effect'
import { factId, pyFloat } from '../compat/fact-id.ts'
import { pyParseFloat } from '../compat/parse.ts'
import { pythonError } from '../compat/python-error.ts'
import {
  isMapping,
  isPyFloat,
  isPyInt,
  isSequence,
  pyReprValue,
  pyStrValue,
  pyTruthy,
  type YamlMapping,
  type YamlValue,
} from '../data/yaml.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'

/** A reaction's level as the file has it, its database value, and the 0 to
 * 1 value the satisfaction uses. */
export const REPORT_LEVELS = {
  liked: { db: 'gostou', value: 1 },
  neutral: { db: 'neutro', value: 0.5 },
  disliked: { db: 'não gostou', value: 0 },
} as const

export type ReportLevel = keyof typeof REPORT_LEVELS

export interface Reaction {
  readonly factId: string
  readonly session: string
  readonly person: string
  readonly filmId: string
  readonly kind: 'rating' | 'report'
  readonly rating: number | null
  /** "9/10", when the Dono gave the Nota out of 10. */
  readonly originalRating: string | null
  readonly reaction: ReportLevel | null
  readonly relayed: boolean
  readonly value: number
  readonly date: string
  readonly source: string
}

export interface Comment {
  readonly factId: string
  readonly session: string
  readonly person: string
  readonly filmId: string
  /** The database's `gosta` or `nao_gosta`, or null when neutral. */
  readonly reaction: 'gosta' | 'nao_gosta' | null
  readonly text: string
  readonly date: string
  readonly source: string
}

export interface SessionSeen {
  readonly factId: string
  readonly session: string
  readonly person: string
  readonly filmId: string
  /** `declarado` for the Dono himself, `relato` for whom he speaks of. */
  readonly kind: 'declarado' | 'relato'
  readonly date: string
  readonly source: string
}

/** A Nota from 0.5 to 5 as the satisfaction's 0 to 1. */
export const ratingValue = (rating: number): number => (rating - 0.5) / 4.5

/** The Fonte of a Session's Fatos. */
export const feedbackSource = (front: YamlMapping, relayed = false): string => {
  const text = `Feedback da Sessão ${pyStrValue(front.get('date') ?? null)}`
  return relayed ? `${text}, repassado pelo Dono` : text
}

/** `item[key]`, or Python's KeyError. */
const field = (item: YamlMapping, key: string): YamlValue => {
  const value = item.get(key)
  if (value === undefined) throw pythonError('KeyError', `'${key}'`)
  return value
}

/** Python's `float(value)`. */
const toFloat = (value: YamlValue): number => {
  if (isPyFloat(value)) return value.float
  if (isPyInt(value)) return Number(value.int)
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string') return pyParseFloat(value)
  throw pythonError(
    'TypeError',
    `float() argument must be a string or a real number, not ${pyReprValue(value)}`,
  )
}

/** The chosen film and the Feedback's date, when the Session has both. */
const given = (
  front: YamlMapping,
): { filmId: string; date: string; reactions: readonly YamlValue[] } | null => {
  const feedback = front.get('feedback')
  const filmId = front.get('chosen')
  if (!pyTruthy(feedback) || !pyTruthy(filmId) || !isMapping(feedback))
    return null
  const reactions = feedback.get('reactions')
  return {
    filmId: pyStrValue(filmId ?? null),
    date: pyStrValue(field(feedback, 'recorded_on')),
    reactions: pyTruthy(reactions) && isSequence(reactions) ? reactions : [],
  }
}

const asMapping = (value: YamlValue): YamlMapping => {
  if (!isMapping(value))
    throw pythonError('TypeError', `${pyReprValue(value)} is not a mapping`)
  return value
}

/** Where a reaction is: the Session, its Feedback and the Pessoa. */
interface ReactionPlace {
  readonly id: string
  readonly front: YamlMapping
  readonly person: string
  readonly filmId: string
  readonly date: string
}

/** A Nota of the Feedback, from its reaction `r`. */
const ratingReaction = (
  place: ReactionPlace & { readonly r: YamlMapping },
): Reaction => {
  const { id, front, r, person, filmId, date } = place
  const rating = toFloat(field(r, 'rating'))
  const relayed = pyTruthy(r.get('relayed') ?? false)
  const source = feedbackSource(front, relayed)
  const original = r.get('original_rating')
  return {
    factId: factId('notas', person, filmId, pyFloat(rating), date, source, id),
    session: id,
    person,
    filmId,
    kind: 'rating',
    rating,
    originalRating:
      original === undefined || original === null ? null : pyStrValue(original),
    reaction: null,
    relayed,
    value: ratingValue(rating),
    date,
    source,
  }
}

/** A Relato of the Feedback, at `reaction`. */
const reportReaction = (
  { id, front, person, filmId, date }: ReactionPlace,
  reaction: ReportLevel,
): Reaction => ({
  factId: factId(
    'reacoes',
    id,
    person,
    filmId,
    REPORT_LEVELS[reaction].db,
    date,
  ),
  session: id,
  person,
  filmId,
  kind: 'report',
  rating: null,
  originalRating: null,
  reaction,
  relayed: false,
  value: REPORT_LEVELS[reaction].value,
  date,
  source: feedbackSource(front),
})

/** One reaction of the Feedback, or `null` for a kind it does not know.
 * A reaction without its fields throws, as Python's did. */
const reactionOf = (
  place: Omit<ReactionPlace, 'person'>,
  value: YamlValue,
): Reaction | null => {
  const r = asMapping(value)
  const person = pyStrValue(field(r, 'person'))
  const kind = field(r, 'kind')
  const level = r.get('reaction')
  if (kind === 'rating') return ratingReaction({ ...place, r, person })
  if (
    kind === 'report' &&
    typeof level === 'string' &&
    Object.hasOwn(REPORT_LEVELS, level)
  )
    return reportReaction({ ...place, person }, level as ReportLevel)
  return null
}

/** The Feedback's reactions (`fatos.reacoes`). */
export const reactions = (
  id: string,
  front: YamlMapping,
): Effect.Effect<ReadonlyArray<Reaction>, EngineError> =>
  Effect.gen(function* () {
    const feedback = given(front)
    if (feedback === null) return []
    const { filmId, date } = feedback
    const list: Reaction[] = []
    for (const value of feedback.reactions) {
      const reaction = reactionOf({ id, front, filmId, date }, value)
      if (reaction === null)
        return yield* engineError(
          'invalid_data',
          `Sessão ${id}: reação inválida ${pyReprValue(value)}`,
        )
      list.push(reaction)
    }
    return list
  })

/** `reactions` for a page that only shows them (the closed Cartaz): what
 * does not parse is left out instead of failing the page. */
export const readableReactions = (
  id: string,
  front: YamlMapping,
): ReadonlyArray<Reaction> => {
  const attempt = <A>(read: () => A): A | null => {
    try {
      return read()
    } catch {
      return null
    }
  }
  const feedback = attempt(() => given(front))
  if (feedback === null) return []
  const { filmId, date } = feedback
  return feedback.reactions.flatMap(
    (value) =>
      attempt(() => reactionOf({ id, front, filmId, date }, value)) ?? [],
  )
}

/** How a comment feels, from its reaction (`fatos.reacao_do_comentario`). */
const commentReaction = (r: YamlMapping): 'gosta' | 'nao_gosta' | null => {
  if (field(r, 'kind') === 'report') {
    const level = field(r, 'reaction')
    return level === 'liked'
      ? 'gosta'
      : level === 'disliked'
        ? 'nao_gosta'
        : null
  }
  const outOf10 = toFloat(field(r, 'rating')) * 2
  return outOf10 >= 7 ? 'gosta' : outOf10 <= 4 ? 'nao_gosta' : null
}

/** The comments of the Feedback (`fatos.comentarios`). `owners` are the
 * Dono slugs: anyone else's comment was relayed by the Dono. */
export const comments = (
  id: string,
  front: YamlMapping,
  owners: ReadonlySet<string>,
): ReadonlyArray<Comment> => {
  const feedback = given(front)
  if (feedback === null) return []
  const { filmId, date } = feedback
  const list: Comment[] = []
  for (const value of feedback.reactions) {
    const r = asMapping(value)
    const text = r.get('comment')
    if (!pyTruthy(text)) continue
    const person = pyStrValue(field(r, 'person'))
    const reaction = commentReaction(r)
    const comment = pyStrValue(text ?? null)
    list.push({
      factId: factId('feedback', id, person, filmId, reaction, comment, date),
      session: id,
      person,
      filmId,
      reaction,
      text: comment,
      date,
      source: feedbackSource(front, !owners.has(person)),
    })
  }
  return list
}

/** The Já visto of every Presente (`fatos.ja_vistos`). */
export const sessionSeen = (
  id: string,
  front: YamlMapping,
  owners: ReadonlySet<string>,
): ReadonlyArray<SessionSeen> => {
  const feedback = given(front)
  if (feedback === null) return []
  const { filmId, date } = feedback
  const attendees = front.get('attendees')
  return (isSequence(attendees) ? attendees : []).map((value) => {
    const person = pyStrValue(value)
    return {
      factId: factId('ja_visto', id, person, filmId, date),
      session: id,
      person,
      filmId,
      kind: owners.has(person) ? 'declarado' : 'relato',
      date,
      source: feedbackSource(front),
    }
  })
}
