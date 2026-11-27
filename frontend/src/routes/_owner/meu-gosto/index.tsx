import { createFileRoute } from '@tanstack/react-router'
import { searchFor, searchParam } from '#/content/catalog-search'
import { isPersonNotice, isPersonRefusal } from '#/content/person-action'
import { readMyStart, readPersonPage } from '#/content/people'
import { readTraktPage } from '#/content/trakt'
import { PersonScreen } from '#/ui/person'

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
    const [page, search, start, trakt] = await Promise.all([
      readPersonPage({ data: context.owner.person }),
      searchFor(deps.buscar, 'all'),
      readMyStart(),
      readTraktPage(),
    ])
    return { page, search, start, showTrakt: trakt.status !== 'unavailable' }
  },
  component: MyTasteRoute,
})

function MyTasteRoute() {
  const { owner } = Route.useRouteContext()
  const { feito, erro } = Route.useSearch()
  const { page, search, start, showTrakt } = Route.useLoaderData()
  return (
    <PersonScreen
      slug={owner.person}
      page={page}
      search={search}
      start={start}
      showTrakt={showTrakt}
      notice={feito}
      refusal={erro}
    />
  )
}
