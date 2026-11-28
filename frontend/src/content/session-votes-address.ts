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

/** A film id of the Catálogo, as the query may carry it. */
const FILM_ID = /^[\w-]{1,40}$/u

/** `mudar`: the deck over every film of the screen, to change her Votos
 * (#275). The router writes it back as `mudar=true` and reads that as
 * `true`, so both spellings hold, or the page loses it (pass 4 F1).
 * `fora`: the films her sim went to after they had left the screen, by
 * id, comma-separated (pass 4 F3). */
export const voteSearch = (search: Record<string, unknown>) => ({
  feito: within(VOTE_NOTICES)(search.feito) ? search.feito : undefined,
  erro: within(VOTE_REFUSALS)(search.erro) ? search.erro : undefined,
  mudar:
    search.mudar === true ||
    search.mudar === 1 ||
    search.mudar === '1' ||
    search.mudar === 'true'
      ? true
      : undefined,
  fora: staleOf(search.fora),
})

/** The ids of `fora`, at most ten, or undefined. */
function staleOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const ids = value
    .split(',')
    .filter((id) => FILM_ID.test(id))
    .slice(0, 10)
  return ids.length > 0 ? ids.join(',') : undefined
}

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
  outcome: {
    feito?: VoteNotice
    erro?: VoteRefusal
    mudar?: true
    fora?: string
  } = {},
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
  if (mudar) query.set('mudar', 'true')
  return `/participar/${page}?${query}`
}

/** The swipe of the link `sessionLink` as `person`: the Votar on the
 * Dono's own Cartaz (#376). The link opens it as her only while she is
 * the one logged in. */
export function ownVotePath(sessionLink: string, person: string): string {
  const query = new URL(sessionLink).searchParams
  return votePath('votar', {
    sessao: query.get('sessao') ?? undefined,
    chave: query.get('chave') ?? undefined,
    presente: person,
  })
}
