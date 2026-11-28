// Where a Sessão's screens live since the layout pass (#219, map #218): its
// Feedback is under the Sessão, at `contar`. `/feedback` redirects here
// (`moved.ts`). Client-safe.

export const SESSIONS_PATH = '/sessoes'
export const PENDING_FEEDBACK_FILTER = 'para-contar'
export const PENDING_FEEDBACK_PATH = `${SESSIONS_PATH}?filtro=${PENDING_FEEDBACK_FILTER}`

export const sessionPath = (session: string) =>
  `${SESSIONS_PATH}/${encodeURIComponent(session)}`

/** Where the Dono tells how the Sessão went. */
export const feedbackPath = (session: string) =>
  `${sessionPath(session)}/contar`

export const sessionDeletePath = (session: string) =>
  `${sessionPath(session)}/excluir`
