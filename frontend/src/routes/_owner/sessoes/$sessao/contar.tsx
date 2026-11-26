import { createFileRoute } from '@tanstack/react-router'
import { filmParam, searchFor, searchParam } from '#/content/catalog-search'
import { isFeedbackRefusal } from '#/content/feedback-form'
import { readFeedbackPage } from '#/content/feedback'
import { FeedbackScreen } from '#/ui/feedback'

export const Route = createFileRoute('/_owner/sessoes/$sessao/contar')({
  validateSearch: (search) => ({
    erro: isFeedbackRefusal(search.erro) ? search.erro : undefined,
    buscar: searchParam(search.buscar),
    filme: filmParam(search.filme),
  }),
  loaderDeps: ({ search }) => ({ buscar: search.buscar }),
  loader: async ({ params, deps }) => {
    const [page, search] = await Promise.all([
      readFeedbackPage({ data: params.sessao }),
      searchFor(deps.buscar, 'films'),
    ])
    return { page, search }
  },
  component: FeedbackRoute,
})

function FeedbackRoute() {
  const { sessao } = Route.useParams()
  const { erro, filme } = Route.useSearch()
  const { page, search } = Route.useLoaderData()
  return (
    <FeedbackScreen
      session={sessao}
      page={page}
      refusal={erro}
      search={search}
      film={filme}
    />
  )
}
