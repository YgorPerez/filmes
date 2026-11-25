// What a Pessoa's page can ask (`POST /pessoas/<slug>/acao`) and what it
// hears back in its query: `?feito=<notice>` or `?erro=<refusal>`. Shared by
// the page and the server (`platform/people.ts`), so nothing here imports
// the engine.

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

const field = (form: FormData, name: string): string | undefined => {
  const value = form.get(name)
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

const oneOf = <T extends string>(
  values: readonly T[],
  value: string | undefined,
): T | undefined => values.find((v) => v === value)

const REACTIONS = ['love', 'like', 'dislike', 'hate'] as const
const LINKS = ['director', 'writer', 'cast', 'series', 'genre'] as const
const LEVELS = ['none', 'low', 'normal', 'high'] as const
const REMOVABLE = ['stated', 'report', 'veto', 'seen'] as const
const RATING = /^(?:[1-4](?:,5)?|0,5|5)$/
const ID = /^(?:tt|Q)\d+$/

/** The form's action, or null when a field is missing or not one the page
 * offers. Whatever the engine itself checks (the target in the Catalog,
 * the text's words) it checks again. */
export function parseAction(form: FormData): PersonAction | null {
  const kind = oneOf(PERSON_ACTIONS, field(form, 'acao'))
  const text = field(form, 'texto')
  const target = field(form, 'alvo')
  const reaction = oneOf(REACTIONS, field(form, 'reacao'))
  const source = field(form, 'fonte')
  switch (kind) {
    case 'declarar':
    case 'relatar': {
      if (!text) return null
      if (target !== undefined && !ID.test(target)) return null
      if (reaction !== undefined && target === undefined) return null
      return {
        kind: kind === 'declarar' ? 'state' : 'report',
        text,
        target,
        reaction,
        source,
      }
    }
    case 'visto': {
      const film = field(form, 'filme')
      const rating = field(form, 'nota')
      if (!film || !/^tt\d+$/.test(film)) return null
      if (rating !== undefined && !RATING.test(rating)) return null
      return { kind: 'seen', film, rating, source }
    }
    case 'vetar': {
      const group = field(form, 'grupo')
      if (!text) return null
      if (group !== undefined)
        return { kind: 'veto', text, target: group, group: true }
      if (!target || !ID.test(target)) return null
      return { kind: 'veto', text, target, group: false }
    }
    case 'ajustar': {
      const link = oneOf(LINKS, field(form, 'elo'))
      const level = oneOf(LEVELS, field(form, 'nivel'))
      return link && level ? { kind: 'adjust', link, level } : null
    }
    case 'pular':
      return text
        ? { kind: 'skip', text, subject: field(form, 'assunto') }
        : null
    case 'responder': {
      const question = field(form, 'pergunta')
      return text && question
        ? { kind: 'answer', question, text, reaction }
        : null
    }
    case 'remover': {
      const what = oneOf(REMOVABLE, field(form, 'tipo'))
      const id = field(form, 'id')
      return what && id ? { kind: 'remove', what, id } : null
    }
    case undefined:
      return null
  }
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
  // The engine cannot run here, or failed: the reason is in the log.
  'indisponivel',
] as const
export type PersonRefusal = (typeof PERSON_REFUSALS)[number]

const within =
  <T extends string>(values: readonly T[]) =>
  (value: unknown): value is T =>
    (values as readonly unknown[]).includes(value)

export const isPersonNotice = within(PERSON_NOTICES)
export const isPersonRefusal = within(PERSON_REFUSALS)

/** Why `/pessoas` shows a refusal: the Pessoa of a form is gone. */
export const isPeopleRefusal = (value: unknown): value is 'pessoa' =>
  value === 'pessoa'
