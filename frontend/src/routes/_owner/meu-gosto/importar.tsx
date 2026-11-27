import { createFileRoute } from '@tanstack/react-router'
import { readImportsPage } from '#/content/imports'
import { doneOf, importsSearch } from '#/content/imports-search'
import { PersonImportsScreen } from '#/ui/person-imports'

// The Dono's own imports, under Meu gosto.
export const Route = createFileRoute('/_owner/meu-gosto/importar')({
  validateSearch: importsSearch,
  loader: ({ context }) => readImportsPage({ data: context.owner.person }),
  component: MyImportsRoute,
})

function MyImportsRoute() {
  const { owner } = Route.useRouteContext()
  const search = Route.useSearch()
  return (
    <PersonImportsScreen
      slug={owner.person}
      page={Route.useLoaderData()}
      done={doneOf(search)}
      refusal={search.erro}
      refusedIn={search.de}
    />
  )
}
