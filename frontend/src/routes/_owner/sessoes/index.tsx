import { createFileRoute } from '@tanstack/react-router'
import { PENDING_FEEDBACK_FILTER } from '#/content/session-paths'
import { readSessions } from '#/content/sessions'
import { SessionList } from '#/ui/sessions'
import { PAGE_TITLES, titled } from '#/ui/page-title'

export const Route = createFileRoute('/_owner/sessoes/')({
  validateSearch: (search) => ({
    filtro:
      search.filtro === PENDING_FEEDBACK_FILTER
        ? PENDING_FEEDBACK_FILTER
        : undefined,
  }),
  loaderDeps: ({ search }) => ({
    pendingOnly: search.filtro === PENDING_FEEDBACK_FILTER,
  }),
  loader: ({ deps }) => readSessions({ data: deps.pendingOnly }),
  head: () => titled(PAGE_TITLES.sessions),
  component: SessionsPage,
})

function SessionsPage() {
  const { filtro } = Route.useSearch()
  return (
    <SessionList
      sessions={Route.useLoaderData()}
      pendingOnly={filtro === PENDING_FEEDBACK_FILTER}
    />
  )
}
