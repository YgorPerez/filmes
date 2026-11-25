// What the Cartaz's reply route says back to the Session's page, in its
// query: what happened (`feito`), why not (`erro`), and the note of the
// warnings and the acrescentar (`nota`). Client-safe.

import { within } from './form-fields'

/** `aberta`: the form opened the Session; `regerada`: a reply took films
 * off or brought an acrescentar, and the Recomendação was redone;
 * `anotada`: only stars and comments, kept in the Session. */
const SESSION_NOTICES = ['aberta', 'regerada', 'anotada'] as const
export type SessionNotice = (typeof SESSION_NOTICES)[number]
export const isSessionNotice = within(SESSION_NOTICES)

const REPLY_REFUSALS = [
  'nada',
  'texto',
  'fechada',
  'regerar',
  'indisponivel',
] as const
export type ReplyRefusal = (typeof REPLY_REFUSALS)[number]
export const isReplyRefusal = within(REPLY_REFUSALS)

/** A note's token: what `rememberNote` gave. */
export const isNoteToken = (value: unknown): value is string =>
  typeof value === 'string' && /^[\w-]{1,64}$/.test(value)
