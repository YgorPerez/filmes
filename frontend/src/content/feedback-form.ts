// What the Feedback form posts (`POST /feedback/<sessao>/enviar`) and what
// the form hears back in its query when refused:
// `/sessoes/<sessao>/contar?erro=<refusal>`. Shared by the page and the server
// (`platform/feedback.ts`), so nothing here imports the engine.
//
// Fields (PT, as the other forms): `filme` is a film of the Recomendação
// (its tt…), `outro` (then `busca`, a title or an IMDb id) or `nada` ("não
// vimos nada"); per Presente, `reacao.<slug>` is `nota:<1…10>` (the 1 to
// 10 of the Cartaz's Já vi, #272, halved to the engine's 0,5 to 5) or
// `relato:<gostou|neutro|nao-gostou>` (empty: no reaction) and
// `comentario.<slug>` what she thought. `corrigir=sim` replaces a told
// Session's Feedback (#344).

import { all, field, searchAsked, within } from './form-fields'

/** The Relato levels the form offers, by their value in the form. */
export const REPORT_CHOICES = {
  gostou: 'gostou',
  neutro: 'neutro',
  'nao-gostou': 'não gostou',
} as const
type ReportChoice = keyof typeof REPORT_CHOICES

/** The Notas the form offers: 1 to 10, as on the Cartaz's Já vi (#272). */
export const RATING_CHOICES = [
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
] as const

/** A Nota of 1 to 10 on the engine's 0,5 to 5: 9 is "4,5". */
const engineRating = (value: string) =>
  String(Number(value) / 2).replace('.', ',')

/** A Presente's reaction, as the form says it. */
export type FeedbackReaction =
  | { person: string; kind: 'rating'; rating: string; comment?: string }
  | { person: string; kind: 'report'; level: string; comment?: string }

/** The Feedback the Dono sent: the chosen film (an id or what she typed in
 * the search; null is "não vimos nada") and the reactions. */
export type FeedbackForm = {
  film: string | null
  reactions: FeedbackReaction[]
  /** It corrects a told Session (#344). */
  correct?: boolean
  attendees?: string[]
}

/** Why not, in `?erro=`. */
export const FEEDBACK_REFUSALS = [
  // No film chosen, or "outro filme" with nothing typed.
  'filme',
  // A comment with no Nota or Relato from that Pessoa.
  'comentario',
  // "Não vimos nada" with a reaction.
  'nada',
  // No film in the Catalog by that name.
  'desconhecido',
  // More than one film by that name.
  'ambiguo',
  // A field holds what the form does not offer.
  'pedido',
  // The Session is not open any more (another tab sent its Feedback).
  'fechada',
  // The engine cannot run here, or failed in a way that passes: the reason
  // is in the log.
  'indisponivel',
  // The engine failed in a way waiting does not fix (#258): the reason is
  // in the log.
  'falha',
] as const
export type FeedbackRefusal = (typeof FEEDBACK_REFUSALS)[number]

const isRating = (value: string) =>
  (RATING_CHOICES as readonly string[]).includes(value)
const isReport = (value: string): value is ReportChoice =>
  Object.hasOwn(REPORT_CHOICES, value)

const REACTION = 'reacao.'
const COMMENT = 'comentario.'

/** The Presentes named by the form's fields, in the form's order. */
function peopleIn(form: FormData): string[] {
  const people = new Set<string>()
  for (const key of form.keys())
    for (const prefix of [REACTION, COMMENT])
      if (key.startsWith(prefix) && key.length > prefix.length)
        people.add(key.slice(prefix.length))
  return [...people]
}

/** The Catálogo search the post asks for (`searchAsked`): the text to look
 * up, at most 200 characters, empty when nothing was typed; undefined when
 * the post sends the Feedback. */
export const feedbackSearch = (form: FormData): string | undefined =>
  searchAsked(form, 'busca')
    ? (field(form, 'busca')?.slice(0, 200) ?? '')
    : undefined

/** What each Presente had filled when the Dono searched the Catálogo: the
 * form comes back with it. */
export type FeedbackDraft = Readonly<
  Record<string, { readonly reaction?: string; readonly comment?: string }>
>

/** The reactions and comments of the form as they are, refused or not. */
export function feedbackDraftOf(form: FormData): FeedbackDraft {
  const draft: Record<string, { reaction?: string; comment?: string }> = {}
  for (const person of peopleIn(form)) {
    const reaction = field(form, `${REACTION}${person}`)
    const comment = field(form, `${COMMENT}${person}`)
    if (reaction !== undefined || comment !== undefined)
      draft[person] = {
        ...(reaction !== undefined && { reaction }),
        ...(comment !== undefined && { comment }),
      }
  }
  return draft
}

type Parsed<A> = { ok: A } | { refused: FeedbackRefusal }

/** One Presente's reaction: absent (a comment alone is refused), a Nota or
 * a Relato. */
function reactionOf(
  form: FormData,
  person: string,
): Parsed<FeedbackReaction | null> {
  const said = field(form, `${REACTION}${person}`)
  const comment = field(form, `${COMMENT}${person}`)
  if (said === undefined)
    return comment === undefined ? { ok: null } : { refused: 'comentario' }
  const sep = said.indexOf(':')
  const kind = said.slice(0, sep)
  const value = said.slice(sep + 1)
  if (kind === 'nota' && isRating(value))
    return {
      ok: { person, kind: 'rating', rating: engineRating(value), comment },
    }
  if (kind === 'relato' && isReport(value))
    return {
      ok: { person, kind: 'report', level: REPORT_CHOICES[value], comment },
    }
  return { refused: 'pedido' }
}

/** The film chosen: a tt… of the list, "nada" (null) or the search's
 * text. Typing in the search is choosing "outro filme", even with no
 * radio. */
function filmOf(form: FormData): Parsed<string | null> {
  const chosen = field(form, 'filme')
  if (chosen === 'nada') return { ok: null }
  const search = chosen === undefined || chosen === 'outro'
  const film = search ? field(form, 'busca') : chosen
  if (film === undefined) return { refused: 'filme' }
  if (!search && !/^tt\d+$/.test(film)) return { refused: 'pedido' }
  return { ok: film }
}

/** The form's Feedback, or why the page refuses it. The engine checks the
 * rest again (the Presentes, the film in the Catalog). */
export function parseFeedback(form: FormData): Parsed<FeedbackForm> {
  const reactions: FeedbackReaction[] = []
  for (const person of peopleIn(form)) {
    const reaction = reactionOf(form, person)
    if ('refused' in reaction) return reaction
    if (reaction.ok) reactions.push(reaction.ok)
  }
  const film = filmOf(form)
  if ('refused' in film) return film
  if (film.ok === null && reactions.length > 0) return { refused: 'nada' }
  const correct = field(form, 'corrigir') === 'sim'
  const attendees = all(form, 'presentes')
  return {
    ok: {
      film: film.ok,
      reactions,
      ...(correct && { correct }),
      ...(form.has('presentes') && { attendees }),
    },
  }
}

export const isFeedbackRefusal = within(FEEDBACK_REFUSALS)

/** A proposed group for a Feedback correction, carried by its form and search. */
export function correctionAttendees(value: unknown): string[] | undefined {
  if (value === undefined) return undefined
  return (Array.isArray(value) ? value : [value]).filter(
    (slug): slug is string => typeof slug === 'string' && slug.length > 0,
  )
}
