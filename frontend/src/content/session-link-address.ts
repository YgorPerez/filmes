// The Link da Sessão's address (`/participar?sessao=…&chave=…&presente=…`)
// and the headers of its public pages. Shared by the pages and the server
// (`platform/session-link.ts`), so nothing here imports the engine.

export function sessionLinkSearch(search: Record<string, unknown>) {
  return {
    sessao: typeof search.sessao === 'string' ? search.sessao : undefined,
    chave: typeof search.chave === 'string' ? search.chave : undefined,
    presente: typeof search.presente === 'string' ? search.presente : undefined,
  }
}

export type SessionLinkSearch = ReturnType<typeof sessionLinkSearch>

export function sessionLinkPath(
  session: string,
  token: string,
  person?: string,
): string {
  const query = new URLSearchParams({ sessao: session, chave: token })
  if (person !== undefined) query.set('presente', person)
  return `/participar?${query}`
}

/** The link's film list for the chosen Presente, where its child pages go
 * back to; null for a link without its Session and key. */
export function sessionLinkHome({
  sessao,
  chave,
  presente,
}: SessionLinkSearch): string | null {
  return sessao && chave ? sessionLinkPath(sessao, chave, presente) : null
}

/** The pages under the link a name can lead to, keeping the page the
 * link asked for (#275). */
const CHILDREN = new Set(['/participar/votar', '/participar/perguntas'])

/** The page the link asked for: one of its child pages, else the names. */
export function askedLinkPage(pathname: string): string {
  const path = pathname.replace(/\/$/, '')
  return CHILDREN.has(path) ? path : '/participar'
}

/** Where a name on the link's first screen leads: the page the link asked
 * for, as that Presente. */
export function pickedLinkPath(
  session: string,
  token: string,
  person: string,
  asked: string,
): string {
  return sessionLinkPath(session, token, person).replace(
    '/participar?',
    `${asked}?`,
  )
}

export const sessionLinkHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
}
