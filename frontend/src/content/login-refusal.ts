/** Why `/entrar` shows a refusal: the `recusa` of its query, which the
 * server's `/auth/*` redirects write (`platform/auth.ts`). */
export const LOGIN_REFUSALS = [
  // The Google email is on no Pessoa who is Dono.
  'nao-dono',
  // The attempt expired or was already used (old tab, another browser).
  'expirou',
  // Google refused, did not answer, or the email is not verified.
  'google',
  // Login is not configured on this server.
  'indisponivel',
] as const

export type LoginRefusal = (typeof LOGIN_REFUSALS)[number]

export const isLoginRefusal = (value: unknown): value is LoginRefusal =>
  (LOGIN_REFUSALS as readonly unknown[]).includes(value)
