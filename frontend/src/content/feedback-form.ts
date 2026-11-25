// What the Feedback form posts (`POST /feedback/<sessao>/enviar`) and what
// the pages hear back in their query: `/feedback?feito=<sessao>` or
// `/feedback/<sessao>?erro=<refusal>`. Shared by the page and the server
// (`platform/feedback.ts`), so nothing here imports the engine.
//
// Fields (PT, as the other forms): `filme` is a film of the Recomendação
// (its tt…), `outro` (then `busca`, a title or an IMDb id) or `nada` ("não
// vimos nada"); per Presente, `reacao.<slug>` is `nota:<0,5…5>` or
// `relato:<gostou|neutro|nao-gostou>` (empty: no reaction) and
// `comentario.<slug>` what she thought.

/** The Relato levels the form offers, by their value in the form. */
export const REPORT_CHOICES = {
  gostou: 'gostou',
  neutro: 'neutro',
  'nao-gostou': 'não gostou',
} as const
type ReportChoice = keyof typeof REPORT_CHOICES

/** The Notas the form offers, on the engine's scale. */
export const RATING_CHOICES = [
  '5',
  '4,5',
  '4',
  '3,5',
  '3',
  '2,5',
  '2',
  '1,5',
  '1',
  '0,5',
] as const

/** A Presente's reaction, as the form says it. */
export type FeedbackReaction =
  | { person: string; kind: 'rating'; rating: string; comment?: string }
  | { person: string; kind: 'report'; level: string; comment?: string }

/** The Feedback the Dono sent: the chosen film (an id or what she typed in
 * the search; null is "não vimos nada") and the reactions. */
export type FeedbackForm = {
  film: string | null
  reactions: FeedbackReaction[]
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
  // The engine cannot run here, or failed: the reason is in the log.
  'indisponivel',
] as const
export type FeedbackRefusal = (typeof FEEDBACK_REFUSALS)[number]

const field = (form: FormData, name: string): string | undefined => {
  const value = form.get(name)
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

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

/** The form's Feedback, or why the page refuses it. The engine checks the
 * rest again (the Presentes, the film in the Catalog). */
export function parseFeedback(
  form: FormData,
): { ok: FeedbackForm } | { refused: FeedbackRefusal } {
  const reactions: FeedbackReaction[] = []
  for (const person of peopleIn(form)) {
    const said = field(form, `${REACTION}${person}`)
    const comment = field(form, `${COMMENT}${person}`)
    if (said === undefined) {
      if (comment !== undefined) return { refused: 'comentario' }
      continue
    }
    const sep = said.indexOf(':')
    const kind = said.slice(0, sep)
    const value = said.slice(sep + 1)
    if (kind === 'nota' && isRating(value))
      reactions.push({ person, kind: 'rating', rating: value, comment })
    else if (kind === 'relato' && isReport(value))
      reactions.push({
        person,
        kind: 'report',
        level: REPORT_CHOICES[value],
        comment,
      })
    else return { refused: 'pedido' }
  }
  const chosen = field(form, 'filme')
  if (chosen === 'nada')
    return reactions.length > 0
      ? { refused: 'nada' }
      : { ok: { film: null, reactions } }
  // Typing in the search is choosing "outro filme", even with no radio.
  const search = chosen === undefined || chosen === 'outro'
  const film = search ? field(form, 'busca') : chosen
  if (film === undefined) return { refused: 'filme' }
  if (!search && !/^tt\d+$/.test(film)) return { refused: 'pedido' }
  return { ok: { film, reactions } }
}

const within =
  <T extends string>(values: readonly T[]) =>
  (value: unknown): value is T =>
    (values as readonly unknown[]).includes(value)

export const isFeedbackRefusal = within(FEEDBACK_REFUSALS)

/** A Session id as the engine writes it (`2026-11-20-iara`, `-2`...):
 * what `?feito=` may carry back to the list. */
export const isSessionId = (value: unknown): value is string =>
  typeof value === 'string' && /^[\w-]{1,120}$/.test(value)

/** Why `/feedback` shows a refusal: the form's Session is gone. */
export const isSessionsRefusal = (value: unknown): value is 'sessao' =>
  value === 'sessao'
