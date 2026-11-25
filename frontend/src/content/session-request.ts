// What the "Nova Sessão" form posts (`POST /sessoes/nova/enviar`) and what
// the pages hear back in their query: `/sessoes/<id>?feito=aberta` or
// `/sessoes/nova?erro=<refusal>`. Shared by the page and the server
// (`platform/sessions.ts`), so nothing here imports the engine.
//
// Fields (PT, as the other forms): `presentes` (repeated, slugs), `regra`
// (`padrao` | `media` | `de`) and `de` (a slug), `climas` (repeated),
// `quantos`, `pedido` (the Dono's words), and the Restrições: `duracao`
// (minutes), `desde`/`ate` (years), `idioma`, `crianca` (age, 0 = no age),
// `gatilhos` and `parecido` (lists separated by commas), `sem-ja-visto`,
// `sem-lento`, `sem-tristeza` (checkboxes).

import { field, oneOf, within } from './form-fields'

/** The Regras the form offers, by their value in the form. */
export const RULE_CHOICES = {
  padrao: 'default',
  media: 'average',
  de: 'by',
} as const
type RuleChoice = keyof typeof RULE_CHOICES
const ruleChoices = Object.keys(RULE_CHOICES) as RuleChoice[]

/** The oldest child the Restrição takes (the engine's `MAX_CHILD_AGE`). */
export const MAX_CHILD_AGE = 17

/** The Session the form asks for, with the engine's field names
 * (`RecommendSessionRequest`). */
export type SessionRequestForm = {
  attendees: string[]
  rule: (typeof RULE_CHOICES)[RuleChoice]
  by?: string
  moods: string[]
  count?: number
  request?: string
  maxDuration?: number
  since?: number
  until?: number
  language?: string
  child?: number
  triggers?: string[]
  similar?: string[]
  unseen?: boolean
  noSlow?: boolean
  noSad?: boolean
}

/** Why not, in `?erro=`. */
export const SESSION_REQUEST_REFUSALS = [
  // Nobody checked.
  'presentes',
  // "De fulano" with no Pessoa, or one who is not among the Presentes.
  'de',
  // A number field holds something else, or out of its range.
  'quantos',
  'duracao',
  'anos',
  'crianca',
  // "Parecido com" holds something that is not an IMDb id, or a film the
  // Catálogo does not have.
  'parecido',
  // A Pessoa the engine does not know (removed since the page loaded).
  'pessoa',
  // Another value the engine refused.
  'pedido',
  // The engine cannot run here, or failed: the reason is in the log.
  'indisponivel',
] as const
export type SessionRequestRefusal = (typeof SESSION_REQUEST_REFUSALS)[number]

export const isSessionRequestRefusal = within(SESSION_REQUEST_REFUSALS)

class Refused extends Error {
  constructor(readonly refusal: SessionRequestRefusal) {
    super(refusal)
  }
}

/** A whole number in [min, max] or absent; anything else is `refusal`. */
function integer(
  form: FormData,
  name: string,
  [min, max]: readonly [number, number],
  refusal: SessionRequestRefusal,
): number | undefined {
  const text = field(form, name)
  if (text === undefined) return undefined
  const value = /^\d+$/.test(text) ? Number(text) : Number.NaN
  if (!(value >= min && value <= max)) throw new Refused(refusal)
  return value
}

/** The items of a list field, separated by commas, each trimmed, the empty
 * ones left out; undefined when none. */
function list(form: FormData, name: string): string[] | undefined {
  const items = (field(form, name) ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
  return items.length > 0 ? items : undefined
}

/** The non-empty values of a repeated field (checkboxes), once each. */
const all = (form: FormData, name: string): string[] => [
  ...new Set(
    form
      .getAll(name)
      .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      .map((v) => v.trim()),
  ),
]

const checked = (form: FormData, name: string) =>
  form.get(name) === 'sim' || undefined

const IMDB_ID = /^tt\d+$/

function attendeesAndRule(form: FormData) {
  const attendees = all(form, 'presentes')
  if (attendees.length === 0) throw new Refused('presentes')
  const rule =
    RULE_CHOICES[oneOf(ruleChoices, field(form, 'regra')) ?? 'padrao']
  if (rule !== 'by') return { attendees, rule }
  const by = field(form, 'de')
  if (by === undefined || !attendees.includes(by)) throw new Refused('de')
  return { attendees, rule, by }
}

const YEARS = [1870, 2100] as const

function years(form: FormData) {
  const since = integer(form, 'desde', YEARS, 'anos')
  const until = integer(form, 'ate', YEARS, 'anos')
  if (since !== undefined && until !== undefined && since > until)
    throw new Refused('anos')
  return { since, until }
}

function similar(form: FormData) {
  const ids = list(form, 'parecido')
  if (ids?.some((id) => !IMDB_ID.test(id))) throw new Refused('parecido')
  return ids
}

/** Drops the absent fields, so the request holds only what was asked. */
const present = <T extends object>(value: T): T =>
  Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T

function read(form: FormData): SessionRequestForm {
  return present({
    ...attendeesAndRule(form),
    moods: all(form, 'climas'),
    count: integer(form, 'quantos', [1, 50], 'quantos'),
    request: field(form, 'pedido'),
    maxDuration: integer(form, 'duracao', [1, 1000], 'duracao'),
    ...years(form),
    language: field(form, 'idioma'),
    child: integer(form, 'crianca', [0, MAX_CHILD_AGE], 'crianca'),
    triggers: list(form, 'gatilhos'),
    similar: similar(form),
    unseen: checked(form, 'sem-ja-visto'),
    noSlow: checked(form, 'sem-lento'),
    noSad: checked(form, 'sem-tristeza'),
  })
}

/** The form as the engine's request, or why the page refuses it. The
 * engine still checks what it alone knows (the Pessoas, the Catálogo). */
export function parseSessionRequest(
  form: FormData,
): { ok: SessionRequestForm } | { refused: SessionRequestRefusal } {
  try {
    return { ok: read(form) }
  } catch (error) {
    if (error instanceof Refused) return { refused: error.refusal }
    throw error
  }
}
