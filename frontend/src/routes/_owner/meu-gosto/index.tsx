import { createFileRoute } from '@tanstack/react-router'
import { readQueue } from '#/content/imports'
import { readTasteSummary } from '#/content/ratings'
import { personSearch, readProblemParam } from '#/content/person-action'
import { readMyStart, readPersonPage } from '#/content/people'
import { readTraktPage } from '#/content/trakt'
import { PersonScreen } from '#/ui/person'

// Meu gosto: the logged-in Dono's own Pessoa page (map #218): her Notas,
// what the setup guide left (the connector, the skipped steps), then her
// taste (#222).
export const Route = createFileRoute('/_owner/meu-gosto/')({
  validateSearch: personSearch,
  loader: async ({ context }) => {
    const [page, start, trakt, queue, taste] = await Promise.all([
      readPersonPage({ data: context.owner.person }),
      readMyStart(),
      readTraktPage(),
      readQueue(),
      readTasteSummary(),
    ])
    // The films of her imports that wait for her in the queue (#274).
    const pending =
      queue?.items.filter((item) => item.people.includes(context.owner.person))
        .length ?? 0
    return {
      page,
      start,
      trakt:
        trakt.status === 'connected' || trakt.status === 'disconnected'
          ? trakt.status
          : null,
      pending,
      taste,
    }
  },
  component: MyTasteRoute,
})

function MyTasteRoute() {
  const { owner } = Route.useRouteContext()
  const { feito, erro, em, campo, editar, item } = Route.useSearch()
  const { page, start, trakt, pending, taste } = Route.useLoaderData()
  return (
    <PersonScreen
      slug={owner.person}
      page={page}
      start={start}
      trakt={trakt}
      pending={pending}
      taste={taste}
      notice={feito}
      refusal={erro}
      spot={em}
      problem={readProblemParam(campo)}
      editing={editar}
      saved={item}
    />
  )
}
