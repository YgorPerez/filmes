import { createFileRoute, notFound } from '@tanstack/react-router'
import { moved, MOVED_TO } from '#/content/moved'
import { personSearch, readProblemParam } from '#/content/person-action'
import { readPersonPage } from '#/content/people'
import { PersonScreen, UnknownPerson } from '#/ui/person'

// A Pessoa's page. The Dono's own is Meu gosto (`/meu-gosto`), with the
// same query. No Pessoa with the slug is a 404 (#273).
export const Route = createFileRoute('/_owner/pessoas/$pessoa/')({
  validateSearch: personSearch,
  beforeLoad: ({ params, context, location }) => {
    if (params.pessoa === context.owner.person)
      moved(MOVED_TO.myTaste, location.searchStr)
  },
  loader: async ({ params }) => {
    const page = await readPersonPage({ data: params.pessoa })
    if (page === 'unknown') throw notFound()
    return { page }
  },
  notFoundComponent: UnknownPerson,
  component: PersonRoute,
})

function PersonRoute() {
  const { pessoa } = Route.useParams()
  const { feito, erro, em, campo, editar } = Route.useSearch()
  const { page } = Route.useLoaderData()
  return (
    <PersonScreen
      slug={pessoa}
      page={page}
      notice={feito}
      refusal={erro}
      spot={em}
      problem={readProblemParam(campo)}
      editing={editar}
    />
  )
}
