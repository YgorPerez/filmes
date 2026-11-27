import { createFileRoute } from '@tanstack/react-router'
import { isNoteToken } from '#/content/billboard-reply'
import { filmParam, searchFor, searchParam } from '#/content/catalog-search'
import { isFeedbackRefusal } from '#/content/feedback-form'
import { feedbackDraftFor, readFeedbackPage } from '#/content/feedback'
import { FeedbackScreen } from '#/ui/feedback'
import { PAGE_TITLES, titled } from '#/ui/page-title'

export const Route = createFileRoute('/_owner/sessoes/$sessao/contar')({
  validateSearch: (search) => ({
    erro: isFeedbackRefusal(search.erro) ? search.erro : undefined,
    buscar: searchParam(search.buscar),
    filme: filmParam(search.filme),
    nota: isNoteToken(search.nota) ? search.nota : undefined,
  }),
  loaderDeps: ({ search }) => ({ buscar: search.buscar, nota: search.nota }),
  loader: async ({ params, deps }) => {
    const [page, search, draft] = await Promise.all([
      readFeedbackPage({ data: params.sessao }),
      searchFor(deps.buscar, 'films'),
      feedbackDraftFor(deps.nota),
    ])
    return { page, search, draft }
  },
  head: () => titled(PAGE_TITLES.feedback),
  component: FeedbackRoute,
})

function FeedbackRoute() {
  const { sessao } = Route.useParams()
  const { erro, filme, nota } = Route.useSearch()
  const { page, search, draft } = Route.useLoaderData()
  return (
    <FeedbackScreen
      session={sessao}
      page={page}
      refusal={erro}
      search={search}
      film={filme}
      draft={draft}
      note={draft ? nota : undefined}
    />
  )
}
