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

export const sessionLinkHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex',
}
