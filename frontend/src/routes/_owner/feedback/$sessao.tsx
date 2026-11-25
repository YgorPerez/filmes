import { createFileRoute } from '@tanstack/react-router'
import { isFeedbackRefusal } from '#/content/feedback-form'
import { readFeedbackPage } from '#/content/feedback'
import { FeedbackScreen } from '#/ui/feedback'

export const Route = createFileRoute('/_owner/feedback/$sessao')({
  validateSearch: (search) => ({
    erro: isFeedbackRefusal(search.erro) ? search.erro : undefined,
  }),
  loader: ({ params }) => readFeedbackPage({ data: params.sessao }),
  component: FeedbackRoute,
})

function FeedbackRoute() {
  const { sessao } = Route.useParams()
  const { erro } = Route.useSearch()
  return (
    <FeedbackScreen
      session={sessao}
      page={Route.useLoaderData()}
      refusal={erro}
    />
  )
}
