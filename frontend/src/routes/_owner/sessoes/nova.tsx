import { createFileRoute } from '@tanstack/react-router'
import { isSessionRequestRefusal } from '#/content/session-request'
import { readRequestOptions } from '#/content/sessions'
import { NewSession } from '#/ui/sessions'

export const Route = createFileRoute('/_owner/sessoes/nova')({
  validateSearch: (search) => ({
    erro: isSessionRequestRefusal(search.erro) ? search.erro : undefined,
  }),
  loader: () => readRequestOptions(),
  component: NewSessionPage,
})

function NewSessionPage() {
  const { erro } = Route.useSearch()
  return <NewSession options={Route.useLoaderData()} refusal={erro} />
}
