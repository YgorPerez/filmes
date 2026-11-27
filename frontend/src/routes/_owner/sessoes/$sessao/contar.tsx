import { createFileRoute } from '@tanstack/react-router'
import { isNoteToken } from '#/content/billboard-reply'
import { filmParam, searchFor, searchParam } from '#/content/catalog-search'
import { isFeedbackRefusal } from '#/content/feedback-form'
import { feedbackDraftFor, readFeedbackPage } from '#/content/feedback'
import { readSessions } from '#/content/sessions'
import { FeedbackScreen } from '#/ui/feedback'

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
    // No open Session by that id: a told one says what they saw (#272).
    const told =
      page === 'unknown'
        ? (await readSessions({ data: false }))?.find(
            (s) => s.id === params.sessao && !s.open,
          )
        : undefined
    return {
      page,
      search,
      draft,
      told: told && { title: told.chosen?.title ?? null },
    }
  },
  component: FeedbackRoute,
})

function FeedbackRoute() {
  const { sessao } = Route.useParams()
  const { erro, filme, nota } = Route.useSearch()
  const { page, search, draft, told } = Route.useLoaderData()
  return (
    <FeedbackScreen
      session={sessao}
      page={page}
      refusal={erro}
      search={search}
      film={filme}
      draft={draft}
      note={draft ? nota : undefined}
      told={told}
    />
  )
}
