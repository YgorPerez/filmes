// The group swipe's addresses on the Link da Sessão (#182): the deck page
// (`/participar/votar`), where its form posts (`/participar/votos`), and
// what the post says back in the deck's query. Client-safe.

import { within } from './form-fields'

/** `votado`: the Votos were recorded and the screen stayed as is;
 * `atualizada`: yes votes prompted a redo; `regerada`: a no prompted it. */
const VOTE_NOTICES = ['votado', 'atualizada', 'regerada'] as const
export type VoteNotice = (typeof VOTE_NOTICES)[number]

/** `regerar`: the Votos were recorded, but the redo failed;
 * `indisponivel`: nothing was recorded; `falha`: nothing was recorded, and
 * waiting does not fix it (#258). */
const VOTE_REFUSALS = ['regerar', 'indisponivel', 'falha'] as const
export type VoteRefusal = (typeof VOTE_REFUSALS)[number]

/** `mudar`: the deck over every film of the screen, to change her Votos
 * (#275). */
export const voteSearch = (search: Record<string, unknown>) => ({
  feito: within(VOTE_NOTICES)(search.feito) ? search.feito : undefined,
  erro: within(VOTE_REFUSALS)(search.erro) ? search.erro : undefined,
  mudar: search.mudar === 1 || search.mudar === '1' ? true : undefined,
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
  outcome: { feito?: VoteNotice; erro?: VoteRefusal; mudar?: true } = {},
): string {
  const query = new URLSearchParams()
  const { mudar, ...said } = outcome
  for (const [key, value] of Object.entries({
    sessao,
    chave,
    presente,
    ...said,
  }))
    if (value !== undefined) query.set(key, value)
  if (mudar) query.set('mudar', '1')
  return `/participar/${page}?${query}`
}
