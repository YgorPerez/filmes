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
  // Corrects an item in place (#330).
  'editar',
  // Access (#166): only an admin, checked by the server.
  'dar-acesso',
  'tirar-acesso',
  // Takes out a Pessoa made by mistake (#273).
  'remover-pessoa',
] as const

type Reaction = 'love' | 'like' | 'dislike' | 'hate'
type Link =
  | 'director'
  | 'writer'
  | 'cast'
  | 'series'
  | 'genre'
  | 'cinematography'
  | 'producer'
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
  | Edit
  | { kind: 'grant'; email: string }
  | { kind: 'revoke' }
  | { kind: 'delete' }

const REACTIONS = ['love', 'like', 'dislike', 'hate'] as const
const LINKS = [
  'director',
  'writer',
  'cast',
  'series',
  'genre',
  'cinematography',
  'producer',
] as const
const LEVELS = ['none', 'low', 'normal', 'high'] as const
const REMOVABLE = ['stated', 'report', 'veto', 'seen'] as const
// A Nota as the forms give it: 1 to 10 with "/10" (#268), or the engine's
// own 0,5 to 5.
const RATING = /^(?:(?:[1-9]|10)\/10|[1-4](?:,5)?|0,5|5)$/
const ID = /^(?:tt|Q)\d+$/

/** An item corrected in place (#330): the form comes prefilled and sends
 * every field, so an empty target, reaction or Nota clears it. */
export type Edit =
  | {
      kind: 'edit'
      what: 'stated' | 'report'
      id: string
      text: string
      target: string | null
      reaction: Reaction | null
      source?: string
    }
  | {
      kind: 'edit'
      what: 'veto'
      id: string
      text: string
      target: string
    }
  | {
      kind: 'edit'
      what: 'seen'
      id: string
      rating: string | null
      source?: string
    }

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

/** A Veto to a tag group (`grupo`) or to an id (`alvo`), never both: the
 * form would not say which one it means (#330). */
const veto: Reader = (form) => {
  const text = field(form, 'texto')
  const group = field(form, 'grupo')
  const target = field(form, 'alvo')
  if (!text) return null
  if (group !== undefined && target !== undefined) return null
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

const edit: Reader = (form) => {
  const what = oneOf(REMOVABLE, field(form, 'tipo'))
  const id = field(form, 'id')
  if (!what || !id) return null
  if (what === 'seen') {
    const rating = field(form, 'nota')
    if (rating !== undefined && !RATING.test(rating)) return null
    return {
      kind: 'edit',
      what,
      id,
      rating: rating ?? null,
      source: field(form, 'fonte'),
    }
  }
  if (what === 'veto') {
    const read = veto(form)
    return read?.kind === 'veto'
      ? { kind: 'edit', what, id, text: read.text, target: read.target }
      : null
  }
  const read = statement(what === 'stated' ? 'state' : 'report')(form)
  if (read?.kind !== 'state' && read?.kind !== 'report') return null
  return {
    kind: 'edit',
    what,
    id,
    text: read.text,
    target: read.target ?? null,
    reaction: read.reaction ?? null,
    source: read.source,
  }
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
  editar: edit,
  'dar-acesso': grant,
  'tirar-acesso': () => ({ kind: 'revoke' }),
  'remover-pessoa': () => ({ kind: 'delete' }),
}

/** An action only an admin may take: giving or taking a Pessoa's access. */
export const isAccessAction = (action: PersonAction) =>
  action.kind === 'grant' || action.kind === 'revoke'

/** What is wrong with one field of a form, for the page to mark it before
 * the post (#268): `required`, empty; `id`, not a tt… or Q…; `film`, not a
 * tt…; `rating`, off the scale; `target`, a Veto with neither an id nor a
 * tag group; `both`, a Veto with both; `reaction`, a reaction with no
 * target to react to. */
export type FieldProblem = {
  field: string
  problem:
    | 'required'
    | 'id'
    | 'film'
    | 'rating'
    | 'target'
    | 'reaction'
    | 'both'
}

const statementProblem = (form: FormData): FieldProblem | null => {
  const target = field(form, 'alvo')
  if (!field(form, 'texto')) return { field: 'texto', problem: 'required' }
  if (target !== undefined && !ID.test(target))
    return { field: 'alvo', problem: 'id' }
  if (field(form, 'reacao') !== undefined && target === undefined)
    return { field: 'alvo', problem: 'reaction' }
  return null
}

const PROBLEMS: Partial<
  Record<
    (typeof PERSON_ACTIONS)[number],
    (form: FormData) => FieldProblem | null
  >
> = {
  declarar: statementProblem,
  relatar: statementProblem,
  visto: (form) => {
    const film = field(form, 'filme')
    const rating = field(form, 'nota')
    if (!film) return { field: 'filme', problem: 'required' }
    if (!/^tt\d+$/.test(film)) return { field: 'filme', problem: 'film' }
    if (rating !== undefined && !RATING.test(rating))
      return { field: 'nota', problem: 'rating' }
    return null
  },
  vetar: (form) => {
    const target = field(form, 'alvo')
    if (!field(form, 'texto')) return { field: 'texto', problem: 'required' }
    if (field(form, 'grupo') !== undefined)
      return target === undefined ? null : { field: 'alvo', problem: 'both' }
    if (target === undefined) return { field: 'alvo', problem: 'target' }
    return ID.test(target) ? null : { field: 'alvo', problem: 'id' }
  },
  editar: (form) => {
    const what = oneOf(REMOVABLE, field(form, 'tipo'))
    if (what === 'seen') {
      const rating = field(form, 'nota')
      return rating !== undefined && !RATING.test(rating)
        ? { field: 'nota', problem: 'rating' }
        : null
    }
    if (what === 'veto') return PROBLEMS.vetar?.(form) ?? null
    return statementProblem(form)
  },
  responder: (form) =>
    field(form, 'texto') ? null : { field: 'texto', problem: 'required' },
  'dar-acesso': (form) =>
    field(form, 'email') ? null : { field: 'email', problem: 'required' },
}

/** The first field of the form that its action would refuse, or null: the
 * page marks it and keeps the post (`ActionForm`); the server refuses the
 * same form as `pedido`. */
export function formProblem(form: FormData): FieldProblem | null {
  const kind = oneOf(PERSON_ACTIONS, field(form, 'acao'))
  return kind ? (PROBLEMS[kind]?.(form) ?? null) : null
}

/** The form's action, or null when a field is missing or not one the page
 * offers. Whatever the engine itself checks (the target in the Catalog,
 * the text's words) it checks again. */
export function parseAction(form: FormData): PersonAction | null {
  const kind = oneOf(PERSON_ACTIONS, field(form, 'acao'))
  return kind ? READERS[kind](form) : null
}

/** The ficha a removal comes back to, by what it removes. */
const REMOVED_IN: Record<(typeof REMOVABLE)[number], string> = {
  stated: 'declarados',
  report: 'relatos',
  veto: 'vetos',
  seen: 'vistos',
}

/** The ficha each action comes back to. */
const SPOTS: Record<(typeof PERSON_ACTIONS)[number], string> = {
  declarar: 'declarados',
  relatar: 'relatos',
  visto: 'vistos',
  vetar: 'vetos',
  ajustar: 'ajustes',
  pular: 'perguntas',
  responder: 'perguntas',
  remover: 'vetos',
  editar: 'vetos',
  'dar-acesso': 'acesso',
  'tirar-acesso': 'acesso',
  'remover-pessoa': 'remover-pessoa',
}

/** Where on her page the form's answer goes (#273): the id of the ficha
 * that posted, or of the Ajuste's row (`ajuste-<elo>`), so the page comes
 * back there (`#<spot>`) and says what happened inside it. Undefined for
 * a form that is not one of the page's. */
export function spotOf(form: FormData): string | undefined {
  const kind = oneOf(PERSON_ACTIONS, field(form, 'acao'))
  if (!kind) return undefined
  if (kind === 'ajustar') {
    const link = oneOf(LINKS, field(form, 'elo'))
    return link ? `ajuste-${link}` : 'ajustes'
  }
  if (kind === 'remover' || kind === 'editar') {
    const what = oneOf(REMOVABLE, field(form, 'tipo'))
    return what ? REMOVED_IN[what] : SPOTS[kind]
  }
  return SPOTS[kind]
}

/** The ficha a spot is in: an Ajuste's row is in Ajustes. */
export const sectionOfSpot = (spot: string) =>
  spot.startsWith('ajuste-') ? 'ajustes' : spot

const PROBLEM_KINDS = [
  'required',
  'id',
  'film',
  'rating',
  'target',
  'reaction',
  'both',
] as const

/** A field problem as `?campo=` carries it: `alvo:target`. */
export const problemParam = ({ field: name, problem }: FieldProblem) =>
  `${name}:${problem}`

/** `?campo=` read back; undefined when it is not one. */
export function readProblemParam(value: unknown): FieldProblem | undefined {
  if (typeof value !== 'string') return undefined
  const [name, problem] = value.split(':')
  const kind = oneOf(PROBLEM_KINDS, problem)
  return name && /^[a-z]+$/.test(name) && kind
    ? { field: name, problem: kind }
    : undefined
}

/** What happened, in `?feito=`. */
export const PERSON_NOTICES = [
  // A new item went into her file.
  'gravado',
  // It was there already: nothing changed.
  'igual',
  'ajustado',
  'removido',
  // Corrected in place (#330).
  'editado',
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
  // She was taken out (#273): the answer goes to `/pessoas`.
  'removida',
] as const
export type PersonNotice = (typeof PERSON_NOTICES)[number]

/** What an action did: its notice, and for an edit the item as it is now
 * (its fato_id), which the page marks (#330). */
export type PersonDone = PersonNotice | { notice: 'editado'; item: string }

/** Why not, in `?erro=`. */
export const PERSON_REFUSALS = [
  // The id is not in the Catalog.
  'alvo',
  // A field is missing or holds what the action does not take.
  'pedido',
  // The item is not in her file any more (removed in another tab).
  'item',
  // An edit that would make it equal to another item of her file (#330).
  'repetido',
  // Access: no e-mail, or one that is not an address.
  'email',
  // Access: another Pessoa has that e-mail.
  'email-usado',
  // Access: she is a Dono already.
  'ja-dono',
  // Access: the logged-in Dono taking her own away.
  'proprio-acesso',
  // Taking her out (#273): she is a Dono, an import holds her history, or
  // a Session lists her.
  'e-dono',
  'tem-import',
  'em-sessao',
  // The IMDb or Letterboxd CSV did not come (`platform/export.ts`): the
  // engine failed.
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

/** A fato_id in the query (`vetos:3f2a…`), or undefined. */
const factIdParam = (value: unknown) =>
  typeof value === 'string' && /^[a-z_]+:[\w-]+$/.test(value)
    ? value
    : undefined

/** The query of a Pessoa's page and Meu gosto: what the last form did
 * (`feito`, `erro`), where (`em`) and, refused, the field it was
 * (`campo`); before the JavaScript, the item open for editing
 * (`editar`); after an edit, the item it saved (`item`). */
export const personSearch = (search: Record<string, unknown>) => ({
  feito: isPersonNotice(search.feito) ? search.feito : undefined,
  erro: isPersonRefusal(search.erro) ? search.erro : undefined,
  em:
    typeof search.em === 'string' && /^[a-z-]+$/.test(search.em)
      ? search.em
      : undefined,
  // Kept as the text it came as: the router writes the query back from
  // what this gives. `readProblemParam` reads it.
  campo:
    readProblemParam(search.campo) === undefined
      ? undefined
      : (search.campo as string),
  // The item open for editing before the JavaScript (#330): its fato_id.
  editar: factIdParam(search.editar),
  // The item an edit just saved (#330): its fato_id, marked on the page.
  item: factIdParam(search.item),
})

/** A Relato's source when the form gives none: who told it, since several
 * Donos may tell (and be told about). */
export const reportSource = (teller: string) => `descrição de ${teller}`
