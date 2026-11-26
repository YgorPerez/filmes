import { createFileRoute } from '@tanstack/react-router'
import { readPairwise } from '#/content/session-link'
import { pairwiseSearch } from '#/content/pairwise-address'
import { PairwiseQuestion } from '#/ui/pairwise'

// The Perguntas par a par of the Link da Sessão (#181). The parent
// (`participar.tsx`) checked the link and shows this only once a Presente
// is chosen.
export const Route = createFileRoute('/participar/perguntas/')({
  validateSearch: pairwiseSearch,
  loaderDeps: ({ search: { sessao, chave, presente } }) => ({
    sessao,
    chave,
    presente,
  }),
  loader: ({ deps }) => readPairwise({ data: deps }),
  component: PairwiseRoute,
})

function PairwiseRoute() {
  const { participation, home } = Route.useRouteContext()
  const { chave, erro } = Route.useSearch()
  const page = Route.useLoaderData()
  const selected = participation?.selected
  if (!participation || !selected || !chave || !home) return null
  return (
    <PairwiseQuestion
      page={page}
      link={{
        session: participation.session,
        token: chave,
        person: selected.person,
      }}
      failed={erro === 1}
      back={home}
    />
  )
}
