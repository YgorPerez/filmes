import { createFileRoute } from '@tanstack/react-router'
import { readVoteDeck } from '#/content/session-link'
import { voteSearch } from '#/content/session-votes-address'
import { VoteScreen } from '#/ui/session-votes'
import { PAGE_TITLES, titled } from '#/ui/page-title'

// The group swipe (#182): the chosen Presente votes on the films of the
// screen she has not voted on yet.
export const Route = createFileRoute('/participar/votar')({
  validateSearch: voteSearch,
  loaderDeps: ({ search: { sessao, chave, presente, feito, erro } }) => ({
    sessao,
    chave,
    presente,
    feito,
    erro,
  }),
  loader: ({ deps: { sessao, chave, presente } }) =>
    readVoteDeck({ data: { sessao, chave, presente } }),
  head: () => titled(PAGE_TITLES.vote),
  component: VoteRoute,
})

function VoteRoute() {
  return (
    <VoteScreen
      deck={Route.useLoaderData()}
      search={Route.useSearch()}
      home={Route.useRouteContext().home}
    />
  )
}
