import { createFileRoute } from '@tanstack/react-router'
import { readSessions } from '#/content/sessions'
import { SessionList } from '#/ui/sessions'

export const Route = createFileRoute('/_owner/sessoes/')({
  loader: () => readSessions(),
  component: SessionsPage,
})

function SessionsPage() {
  return <SessionList sessions={Route.useLoaderData()} />
}
