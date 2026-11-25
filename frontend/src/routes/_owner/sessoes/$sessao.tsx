import { createFileRoute } from '@tanstack/react-router'
import { isOpenedNotice } from '#/content/session-request'
import { readSessionPage } from '#/content/sessions'
import { SessionScreen } from '#/ui/sessions'

export const Route = createFileRoute('/_owner/sessoes/$sessao')({
  validateSearch: (search) => ({
    feito: isOpenedNotice(search.feito) ? search.feito : undefined,
  }),
  loader: ({ params }) => readSessionPage({ data: params.sessao }),
  component: SessionRoute,
})

function SessionRoute() {
  const { feito } = Route.useSearch()
  return (
    <SessionScreen page={Route.useLoaderData()} opened={feito === 'aberta'} />
  )
}
