import { createFileRoute } from '@tanstack/react-router'
import { pairwisePath } from '#/content/pairwise-address'
import { readVoteDeck } from '#/content/session-link'
import { voteSearch } from '#/content/session-votes-address'
import { VoteScreen } from '#/ui/session-votes'

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
  component: VoteRoute,
})

function VoteRoute() {
  const { participation, home } = Route.useRouteContext()
  const search = Route.useSearch()
  const questions =
    participation?.selected && participation.questions > 0 && search.chave
      ? pairwisePath(
          participation.session,
          search.chave,
          participation.selected.person,
        )
      : null
  return (
    <VoteScreen
      deck={Route.useLoaderData()}
      search={search}
      home={home}
      owner={participation?.owner ?? null}
      questions={questions}
    />
  )
}
