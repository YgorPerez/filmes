import { createFileRoute } from '@tanstack/react-router'
import { searchFor, searchParam } from '#/content/catalog-search'
import { isPersonNotice, isPersonRefusal } from '#/content/person-action'
import { readPersonPage } from '#/content/people'
import { PersonScreen } from '#/ui/person'

export const Route = createFileRoute('/_owner/pessoas/$pessoa')({
  validateSearch: (search) => ({
    feito: isPersonNotice(search.feito) ? search.feito : undefined,
    erro: isPersonRefusal(search.erro) ? search.erro : undefined,
    buscar: searchParam(search.buscar),
  }),
  loaderDeps: ({ search }) => ({ buscar: search.buscar }),
  loader: async ({ params, deps }) => {
    const [page, search] = await Promise.all([
      readPersonPage({ data: params.pessoa }),
      searchFor(deps.buscar, 'all'),
    ])
    return { page, search }
  },
  component: PersonRoute,
})

function PersonRoute() {
  const { pessoa } = Route.useParams()
  const { feito, erro } = Route.useSearch()
  const { page, search } = Route.useLoaderData()
  return (
    <PersonScreen
      slug={pessoa}
      page={page}
      search={search}
      notice={feito}
      refusal={erro}
    />
  )
}
