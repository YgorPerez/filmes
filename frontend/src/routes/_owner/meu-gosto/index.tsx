import { createFileRoute } from '@tanstack/react-router'
import { searchFor, searchParam } from '#/content/catalog-search'
import { isPersonNotice, isPersonRefusal } from '#/content/person-action'
import { readPersonPage } from '#/content/people'
import { PersonScreen } from '#/ui/person'

// Meu gosto: the logged-in Dono's own Pessoa page (map #218). For now it is
// her Pessoa page as `/pessoas/<slug>` drew it, with the way to her Notas,
// import and export; #222 redoes it.
export const Route = createFileRoute('/_owner/meu-gosto/')({
  validateSearch: (search) => ({
    feito: isPersonNotice(search.feito) ? search.feito : undefined,
    erro: isPersonRefusal(search.erro) ? search.erro : undefined,
    buscar: searchParam(search.buscar),
  }),
  loaderDeps: ({ search }) => ({ buscar: search.buscar }),
  loader: async ({ context, deps }) => {
    const [page, search] = await Promise.all([
      readPersonPage({ data: context.owner.person }),
      searchFor(deps.buscar, 'all'),
    ])
    return { page, search }
  },
  component: MyTasteRoute,
})

function MyTasteRoute() {
  const { owner } = Route.useRouteContext()
  const { feito, erro } = Route.useSearch()
  const { page, search } = Route.useLoaderData()
  return (
    <PersonScreen
      slug={owner.person}
      page={page}
      search={search}
      notice={feito}
      refusal={erro}
    />
  )
}
