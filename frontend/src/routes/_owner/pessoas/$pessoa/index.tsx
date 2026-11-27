import { createFileRoute } from '@tanstack/react-router'
import { searchFor, searchParam } from '#/content/catalog-search'
import { moved, MOVED_TO } from '#/content/moved'
import { isPersonNotice, isPersonRefusal } from '#/content/person-action'
import { readPersonPage } from '#/content/people'
import { PersonScreen } from '#/ui/person'
import { titled } from '#/ui/page-title'

// A Pessoa's page. The Dono's own is Meu gosto (`/meu-gosto`), with the
// same query.
export const Route = createFileRoute('/_owner/pessoas/$pessoa/')({
  validateSearch: (search) => ({
    feito: isPersonNotice(search.feito) ? search.feito : undefined,
    erro: isPersonRefusal(search.erro) ? search.erro : undefined,
    buscar: searchParam(search.buscar),
  }),
  loaderDeps: ({ search }) => ({ buscar: search.buscar }),
  beforeLoad: ({ params, context, location }) => {
    if (params.pessoa === context.owner.person)
      moved(MOVED_TO.myTaste, location.searchStr)
  },
  loader: async ({ params, deps }) => {
    const [page, search] = await Promise.all([
      readPersonPage({ data: params.pessoa }),
      searchFor(deps.buscar, 'all'),
    ])
    return { page, search }
  },
  head: ({ loaderData }) =>
    titled(
      loaderData?.page && loaderData.page !== 'unknown'
        ? loaderData.page.name
        : null,
    ),
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
