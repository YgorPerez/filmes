import { sessionLinkSearch } from './session-link-address'

// The Perguntas par a par's address (#181), `/participar/perguntas`, shared
// by the pages and the server, so nothing here imports the engine.

/** `/participar/perguntas`, with the link's key and the chosen Presente. */
export function pairwisePath(
  session: string,
  token: string,
  person: string,
): string {
  const query = new URLSearchParams({
    sessao: session,
    chave: token,
    presente: person,
  })
  return `/participar/perguntas?${query}`
}

/** The page's search: the link's, and `erro` when an answer was not kept. */
export const pairwiseSearch = (search: Record<string, unknown>) => ({
  ...sessionLinkSearch(search),
  erro: search.erro === 1 || search.erro === '1' ? (1 as const) : undefined,
})
