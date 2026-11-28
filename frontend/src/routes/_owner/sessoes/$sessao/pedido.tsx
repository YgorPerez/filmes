import { createFileRoute } from '@tanstack/react-router'
import { isSessionEditRefusal } from '#/content/session-edit'
import { readSessionEdit } from '#/content/session-edit-page'
import { SessionEditScreen } from '#/ui/session-edit'

export const Route = createFileRoute('/_owner/sessoes/$sessao/pedido')({
  validateSearch: (search) => ({
    erro: isSessionEditRefusal(search.erro) ? search.erro : undefined,
  }),
  loader: ({ params }) => readSessionEdit({ data: params.sessao }),
  component: SessionEditRoute,
})

function SessionEditRoute() {
  const { sessao } = Route.useParams()
  const { erro } = Route.useSearch()
  return (
    <SessionEditScreen
      id={sessao}
      page={Route.useLoaderData()}
      refusal={erro}
    />
  )
}
