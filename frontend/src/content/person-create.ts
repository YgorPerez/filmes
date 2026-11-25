// What the "Acrescentar Pessoa" form of `/pessoas` posts
// (`POST /pessoas/nova/enviar`) and what the list hears back when it is
// refused: `/pessoas?erro=<refusal>` with what the Dono typed, so one typo
// does not make her start over. On success the new Pessoa's page opens with
// `?feito=criada`. Shared by the page and the server
// (`platform/people.ts`), so nothing here imports the engine.
//
// Fields (PT, as the other forms): `nome`, `apelidos` (separated by
// commas), `dono` (checkbox, `sim`) and `email`.

import { field, within } from './form-fields'

/** The new Pessoa as the form says it, with the engine's names
 * (`personCreate`). */
export type NewPersonForm = {
  name: string
  aliases: string[]
  owner: boolean
  email?: string
}

/** Why not, in `?erro=`. */
export const PERSON_CREATE_REFUSALS = [
  // No name, or one that makes no valid slug.
  'nome',
  // "dono" is how a request finds the Dono.
  'reservado',
  // A Pessoa with that slug exists.
  'existe',
  // The name or an alias already finds another Pessoa.
  'nome-usado',
  // A Dono without an e-mail, or one that is not an address.
  'email',
  // Another Pessoa has that e-mail.
  'email-usado',
  // The engine cannot run here, or failed: the reason is in the log.
  'indisponivel',
] as const
export type PersonCreateRefusal = (typeof PERSON_CREATE_REFUSALS)[number]

export const isPersonCreateRefusal = within(PERSON_CREATE_REFUSALS)

/** What the Dono typed, to fill the form again after a refusal. */
export type TypedPerson = {
  name?: string
  aliases?: string
  owner?: boolean
  email?: string
}

/** The same, as it rides in the query: the form's field names (PT). */
export type TypedQuery = {
  nome?: string
  apelidos?: string
  dono?: 'sim'
  email?: string
}

/** What the form held. */
export const typedPerson = (form: FormData): TypedPerson => ({
  name: field(form, 'nome'),
  aliases: field(form, 'apelidos'),
  owner: field(form, 'dono') === 'sim' || undefined,
  email: field(form, 'email'),
})

/** The query that brings it back. */
export const queryOfTyped = (typed: TypedPerson): TypedQuery => ({
  nome: typed.name,
  apelidos: typed.aliases,
  dono: typed.owner ? 'sim' : undefined,
  email: typed.email,
})

/** The typed values a page keeps from its query: strings only. */
export function typedQuery(search: Record<string, unknown>): TypedQuery {
  const text = (value: unknown) =>
    typeof value === 'string' && value !== '' ? value : undefined
  return {
    nome: text(search.nome),
    apelidos: text(search.apelidos),
    dono: search.dono === 'sim' ? 'sim' : undefined,
    email: text(search.email),
  }
}

/** The query's values back in the form's terms. */
export const typedOfQuery = (query: TypedQuery): TypedPerson => ({
  name: query.nome,
  aliases: query.apelidos,
  owner: query.dono === 'sim' || undefined,
  email: query.email,
})

/** The new Pessoa, or why the form cannot make one. The engine checks the
 * rest (the slug, the address, who has it). An e-mail typed for someone
 * who is not a Dono is left out: only a Dono has one, to log in. */
export function parseNewPerson(
  form: FormData,
): NewPersonForm | 'nome' | 'email' {
  const typed = typedPerson(form)
  if (!typed.name) return 'nome'
  const aliases = (typed.aliases ?? '')
    .split(',')
    .map((alias) => alias.trim())
    .filter((alias) => alias !== '')
  if (!typed.owner) return { name: typed.name, aliases, owner: false }
  if (!typed.email) return 'email'
  return { name: typed.name, aliases, owner: true, email: typed.email }
}
