import { createFileRoute } from '@tanstack/react-router'
import { personSearch } from '#/content/person-action'
import { readMyStart, readPersonPage } from '#/content/people'
import { readTraktPage } from '#/content/trakt'
import { PersonScreen } from '#/ui/person'

// Meu gosto: the logged-in Dono's own Pessoa page (map #218): her Notas,
// what the setup guide left (the connector, the skipped steps), then her
// taste (#222).
export const Route = createFileRoute('/_owner/meu-gosto/')({
  validateSearch: personSearch,
  loader: async ({ context }) => {
    const [page, start, trakt] = await Promise.all([
      readPersonPage({ data: context.owner.person }),
      readMyStart(),
      readTraktPage(),
    ])
    return { page, start, showTrakt: trakt.status !== 'unavailable' }
  },
  component: MyTasteRoute,
})

function MyTasteRoute() {
  const { owner } = Route.useRouteContext()
  const { feito, erro, em, campo } = Route.useSearch()
  const { page, start, showTrakt } = Route.useLoaderData()
  return (
    <PersonScreen
      slug={owner.person}
      page={page}
      start={start}
      showTrakt={showTrakt}
      notice={feito}
      refusal={erro}
      spot={em}
      problem={campo}
    />
  )
}
