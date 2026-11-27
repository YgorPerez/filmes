import { createFileRoute } from '@tanstack/react-router'
import { searchFor, searchParam } from '#/content/catalog-search'
import { isPersonNotice, isPersonRefusal } from '#/content/person-action'
import { readMyStart, readPersonPage } from '#/content/people'
import { PersonScreen } from '#/ui/person'
import { PAGE_TITLES, titled } from '#/ui/page-title'

// Meu gosto: the logged-in Dono's own Pessoa page (map #218): her Notas,
// what the setup guide left (the connector, the skipped steps), then her
// taste (#222).
export const Route = createFileRoute('/_owner/meu-gosto/')({
  validateSearch: (search) => ({
    feito: isPersonNotice(search.feito) ? search.feito : undefined,
    erro: isPersonRefusal(search.erro) ? search.erro : undefined,
    buscar: searchParam(search.buscar),
  }),
  loaderDeps: ({ search }) => ({ buscar: search.buscar }),
  loader: async ({ context, deps }) => {
    const [page, search, start] = await Promise.all([
      readPersonPage({ data: context.owner.person }),
      searchFor(deps.buscar, 'all'),
      readMyStart(),
    ])
    return { page, search, start }
  },
  head: () => titled(PAGE_TITLES.myTaste),
  component: MyTasteRoute,
})

function MyTasteRoute() {
  const { owner } = Route.useRouteContext()
  const { feito, erro } = Route.useSearch()
  const { page, search, start } = Route.useLoaderData()
  return (
    <PersonScreen
      slug={owner.person}
      page={page}
      search={search}
      start={start}
      notice={feito}
      refusal={erro}
    />
  )
}
