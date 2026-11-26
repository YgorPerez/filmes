// What a Pessoa's page can ask (`POST /pessoas/<slug>/acao`) and what it
// hears back in its query: `?feito=<notice>` or `?erro=<refusal>`. Shared by
// the page and the server (`platform/people.ts`), so nothing here imports
// the engine.

import { field, oneOf, within } from './form-fields'

/** The form's `acao`, one per `pessoa` action the page offers. */
const PERSON_ACTIONS = [
  'declarar',
  'relatar',
  'visto',
  'vetar',
  'ajustar',
  'pular',
  'responder',
  'remover',
  // Access (#166): only an admin, checked by the server.
  'dar-acesso',
  'tirar-acesso',
] as const

type Reaction = 'love' | 'like' | 'dislike' | 'hate'
type Link = 'director' | 'writer' | 'cast' | 'series' | 'genre'
type Level = 'none' | 'low' | 'normal' | 'high'

/** A Declarado or a Relato as the form says it. */
type Statement = {
  text: string
  target?: string
  reaction?: Reaction
  source?: string
}

export type PersonAction =
  | ({ kind: 'state' } & Statement)
  | ({ kind: 'report' } & Statement)
  | { kind: 'seen'; film: string; rating?: string; source?: string }
  | { kind: 'veto'; text: string; target: string; group: boolean }
  | { kind: 'adjust'; link: Link; level: Level }
  | { kind: 'skip'; text: string; subject?: string }
  | { kind: 'answer'; question: string; text: string; reaction?: Reaction }
  | {
      kind: 'remove'
      what: 'stated' | 'report' | 'veto' | 'seen'
      id: string
    }
  | { kind: 'grant'; email: string }
  | { kind: 'revoke' }

const REACTIONS = ['love', 'like', 'dislike', 'hate'] as const
const LINKS = ['director', 'writer', 'cast', 'series', 'genre'] as const
const LEVELS = ['none', 'low', 'normal', 'high'] as const
const REMOVABLE = ['stated', 'report', 'veto', 'seen'] as const
const RATING = /^(?:[1-4](?:,5)?|0,5|5)$/
const ID = /^(?:tt|Q)\d+$/

type Reader = (form: FormData) => PersonAction | null

/** A Declarado or a Relato: a target must be an id, and a reaction needs
 * one. */
const statement =
  (kind: 'state' | 'report'): Reader =>
  (form) => {
    const text = field(form, 'texto')
    const target = field(form, 'alvo')
    const reaction = oneOf(REACTIONS, field(form, 'reacao'))
    if (!text) return null
    if (target !== undefined && !ID.test(target)) return null
    if (reaction !== undefined && target === undefined) return null
    return { kind, text, target, reaction, source: field(form, 'fonte') }
  }

const seen: Reader = (form) => {
  const film = field(form, 'filme')
  const rating = field(form, 'nota')
  if (!film || !/^tt\d+$/.test(film)) return null
  if (rating !== undefined && !RATING.test(rating)) return null
  return { kind: 'seen', film, rating, source: field(form, 'fonte') }
}

/** A Veto to a tag group (`grupo`) or to an id (`alvo`). */
const veto: Reader = (form) => {
  const text = field(form, 'texto')
  const group = field(form, 'grupo')
  const target = field(form, 'alvo')
  if (!text) return null
  if (group !== undefined)
    return { kind: 'veto', text, target: group, group: true }
  if (!target || !ID.test(target)) return null
  return { kind: 'veto', text, target, group: false }
}

const adjust: Reader = (form) => {
  const link = oneOf(LINKS, field(form, 'elo'))
  const level = oneOf(LEVELS, field(form, 'nivel'))
  return link && level ? { kind: 'adjust', link, level } : null
}

const skip: Reader = (form) => {
  const text = field(form, 'texto')
  return text ? { kind: 'skip', text, subject: field(form, 'assunto') } : null
}

const answer: Reader = (form) => {
  const text = field(form, 'texto')
  const question = field(form, 'pergunta')
  const reaction = oneOf(REACTIONS, field(form, 'reacao'))
  return text && question ? { kind: 'answer', question, text, reaction } : null
}

const remove: Reader = (form) => {
  const what = oneOf(REMOVABLE, field(form, 'tipo'))
  const id = field(form, 'id')
  return what && id ? { kind: 'remove', what, id } : null
}

const grant: Reader = (form) => {
  const email = field(form, 'email')
  return email ? { kind: 'grant', email } : null
}

const READERS: Record<(typeof PERSON_ACTIONS)[number], Reader> = {
  declarar: statement('state'),
  relatar: statement('report'),
  visto: seen,
  vetar: veto,
  ajustar: adjust,
  pular: skip,
  responder: answer,
  remover: remove,
  'dar-acesso': grant,
  'tirar-acesso': () => ({ kind: 'revoke' }),
}

/** An action only an admin may take: giving or taking a Pessoa's access. */
export const isAccessAction = (action: PersonAction) =>
  action.kind === 'grant' || action.kind === 'revoke'

/** The form's action, or null when a field is missing or not one the page
 * offers. Whatever the engine itself checks (the target in the Catalog,
 * the text's words) it checks again. */
export function parseAction(form: FormData): PersonAction | null {
  const kind = oneOf(PERSON_ACTIONS, field(form, 'acao'))
  return kind ? READERS[kind](form) : null
}

/** What happened, in `?feito=`. */
export const PERSON_NOTICES = [
  // A new item went into her file.
  'gravado',
  // It was there already: nothing changed.
  'igual',
  'ajustado',
  'removido',
  // An open question skipped once more, still on the list.
  'pulada',
  // Skipped twice: it left the list.
  'saiu',
  // Answered: a Declarado, and the question left the list.
  'respondida',
  // A new Pessoa, from the form of `/pessoas`.
  'criada',
  // She is a Dono now, or no longer (#166).
  'acesso-dado',
  'acesso-tirado',
] as const
export type PersonNotice = (typeof PERSON_NOTICES)[number]

/** Why not, in `?erro=`. */
export const PERSON_REFUSALS = [
  // The id is not in the Catalog.
  'alvo',
  // A field is missing or holds what the action does not take.
  'pedido',
  // The item is not in her file any more (removed in another tab).
  'item',
  // Access: no e-mail, or one that is not an address.
  'email',
  // Access: another Pessoa has that e-mail.
  'email-usado',
  // Access: she is a Dono already.
  'ja-dono',
  // Access: the logged-in Dono taking her own away.
  'proprio-acesso',
  // The IMDb CSV did not come (`platform/export.ts`): the engine failed.
  'exportar',
  // The engine cannot run here, or failed in a way that passes: the reason
  // is in the log.
  'indisponivel',
  // The engine failed in a way waiting does not fix (#258): the reason is
  // in the log.
  'falha',
] as const
export type PersonRefusal = (typeof PERSON_REFUSALS)[number]

export const isPersonNotice = within(PERSON_NOTICES)
export const isPersonRefusal = within(PERSON_REFUSALS)

/** Why `/pessoas` shows a refusal: the Pessoa of a form is gone. */
export const isPeopleRefusal = (value: unknown): value is 'pessoa' =>
  value === 'pessoa'

/** A Relato's source when the form gives none: who told it, since several
 * Donos may tell (and be told about). */
export const reportSource = (teller: string) => `descrição de ${teller}`
