// What the Cartaz's reply route says back to the Session's page, in its
// query: what happened (`feito`), why not (`erro`), and the note of the
// warnings and the acrescentar (`nota`). Client-safe.

import { within } from './form-fields'

/** `aberta`: the form opened the Session; `regerada`: a reply took films
 * off or brought an acrescentar, and the Recomendação was redone;
 * `anotada`: only stars and comments, kept in the Session;
 * `perguntas-gravadas` and `perguntas-descartadas`: the Dono's decision on
 * a Presente's Perguntas par a par (#181); `contada`: the Feedback was
 * recorded and the Sessão closed. */
const SESSION_NOTICES = [
  'aberta',
  'regerada',
  'anotada',
  'perguntas-gravadas',
  'perguntas-descartadas',
  'contada',
] as const
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
