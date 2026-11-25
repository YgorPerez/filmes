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
  // A Dono without an e-mail, or one that is not an address.
  'email',
  // Another Pessoa has that e-mail.
  'email-usado',
  // The engine cannot run here, or failed: the reason is in the log.
  'indisponivel',
] as const
export type PersonCreateRefusal = (typeof PERSON_CREATE_REFUSALS)[number]

export const isPersonCreateRefusal = within(PERSON_CREATE_REFUSALS)

/** What the Dono typed, by field, as it comes back in the query. */
export type TypedPerson = {
  nome?: string
  apelidos?: string
  dono?: 'sim'
  email?: string
}

/** What the form held, to fill it again after a refusal. */
export const typedPerson = (form: FormData): TypedPerson => ({
  nome: field(form, 'nome'),
  apelidos: field(form, 'apelidos'),
  dono: field(form, 'dono') === 'sim' ? 'sim' : undefined,
  email: field(form, 'email'),
})

/** The typed values a page keeps from its query: strings only. */
export function typedFromSearch(search: Record<string, unknown>): TypedPerson {
  const text = (value: unknown) =>
    typeof value === 'string' && value !== '' ? value : undefined
  return {
    nome: text(search.nome),
    apelidos: text(search.apelidos),
    dono: search.dono === 'sim' ? 'sim' : undefined,
    email: text(search.email),
  }
}

/** The new Pessoa, or why the form cannot make one. The engine checks the
 * rest (the slug, the address, who has it). An e-mail typed for someone
 * who is not a Dono is left out: only a Dono has one, to log in. */
export function parseNewPerson(
  form: FormData,
): NewPersonForm | 'nome' | 'email' {
  const typed = typedPerson(form)
  if (!typed.nome) return 'nome'
  const aliases = (typed.apelidos ?? '')
    .split(',')
    .map((alias) => alias.trim())
    .filter((alias) => alias !== '')
  if (typed.dono !== 'sim')
    return { name: typed.nome, aliases, owner: false }
  if (!typed.email) return 'email'
  return { name: typed.nome, aliases, owner: true, email: typed.email }
}
