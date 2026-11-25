import { createFileRoute } from '@tanstack/react-router'
import { isSessionId, isSessionsRefusal } from '#/content/feedback-form'
import { readOpenSessions } from '#/content/feedback'
import { OpenSessions } from '#/ui/feedback'

export const Route = createFileRoute('/_owner/feedback/')({
  validateSearch: (search) => ({
    feito: isSessionId(search.feito) ? search.feito : undefined,
    erro: isSessionsRefusal(search.erro) ? search.erro : undefined,
  }),
  loader: () => readOpenSessions(),
  component: OpenSessionsPage,
})

function OpenSessionsPage() {
  const { feito, erro } = Route.useSearch()
  return (
    <OpenSessions
      sessions={Route.useLoaderData()}
      recorded={feito}
      gone={erro === 'sessao'}
    />
  )
}
