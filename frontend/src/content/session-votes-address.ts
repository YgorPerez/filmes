// The group swipe's addresses on the Link da Sessão (#182): the deck page
// (`/participar/votar`), where its form posts (`/participar/votos`), and
// what the post says back in the deck's query. Client-safe.

import { within } from './form-fields'

/** `votado`: the Votos were recorded and nothing left the screen;
 * `regerada`: a no took a film off and the Recomendação was redone. */
const VOTE_NOTICES = ['votado', 'regerada'] as const
export type VoteNotice = (typeof VOTE_NOTICES)[number]

/** `regerar`: the Votos were recorded, but the redo failed;
 * `indisponivel`: nothing was recorded. */
const VOTE_REFUSALS = ['regerar', 'indisponivel'] as const
export type VoteRefusal = (typeof VOTE_REFUSALS)[number]

export const voteSearch = (search: Record<string, unknown>) => ({
  feito: within(VOTE_NOTICES)(search.feito) ? search.feito : undefined,
  erro: within(VOTE_REFUSALS)(search.erro) ? search.erro : undefined,
})

/** A page of the swipe, with the link's search and, after a post, what
 * happened. */
export function votePath(
  page: 'votar' | 'votos',
  {
    sessao,
    chave,
    presente,
  }: {
    sessao?: string | undefined
    chave?: string | undefined
    presente?: string | undefined
  },
  outcome: { feito?: VoteNotice; erro?: VoteRefusal } = {},
): string {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries({
    sessao,
    chave,
    presente,
    ...outcome,
  }))
    if (value !== undefined) query.set(key, value)
  return `/participar/${page}?${query}`
}
