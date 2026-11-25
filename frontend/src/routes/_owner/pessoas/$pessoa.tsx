import { createFileRoute } from '@tanstack/react-router'
import { isPersonNotice, isPersonRefusal } from '#/content/person-action'
import { readPersonPage } from '#/content/people'
import { PersonScreen } from '#/ui/person'

export const Route = createFileRoute('/_owner/pessoas/$pessoa')({
  validateSearch: (search) => ({
    feito: isPersonNotice(search.feito) ? search.feito : undefined,
    erro: isPersonRefusal(search.erro) ? search.erro : undefined,
  }),
  loader: ({ params }) => readPersonPage({ data: params.pessoa }),
  component: PersonRoute,
})

function PersonRoute() {
  const { pessoa } = Route.useParams()
  const { feito, erro } = Route.useSearch()
  return (
    <PersonScreen
      slug={pessoa}
      page={Route.useLoaderData()}
      notice={feito}
      refusal={erro}
    />
  )
}
