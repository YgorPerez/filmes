// What the edit form of an open Session (#372, map #369) posts
// (`POST /sessoes/<id>/pedido/enviar`) and what its page hears back:
// `/sessoes/<id>?feito=regerada` once the Session was redone, or
// `/sessoes/<id>/pedido?erro=<refusal>`. The fields are Nova Sessão's
// (`session-request.ts`) without the Presentes and the Regra. Shared by the
// page and the server, so nothing here imports the engine.

import { SESSION_REQUEST_REFUSALS } from './session-request'

/** Why not, in `?erro=`: the form's own, and the Session that was told
 * meanwhile (`fechada`) or a Dono who was not there (`ausente`). */
const SESSION_EDIT_REFUSALS = [
  ...SESSION_REQUEST_REFUSALS,
  'fechada',
  'ausente',
] as const
export type SessionEditRefusal = (typeof SESSION_EDIT_REFUSALS)[number]
export const isSessionEditRefusal = (
  value: unknown,
): value is SessionEditRefusal =>
  (SESSION_EDIT_REFUSALS as readonly unknown[]).includes(value)

/** Where the edit form goes back to: the Session's page (`sessionPath`). */
export const sessionEditBack = (id: string) =>
  `/sessoes/${encodeURIComponent(id)}`

/** The address the edit form lives at. */
export const sessionEditPath = (id: string) => `${sessionEditBack(id)}/pedido`
