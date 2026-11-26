import { createFileRoute } from '@tanstack/react-router'
import { readImportsPage } from '#/content/imports'
import { importsSearch, PersonImportsScreen } from '#/ui/person-imports'

// The Dono's own imports, under Meu gosto.
export const Route = createFileRoute('/_owner/meu-gosto/importar')({
  validateSearch: importsSearch,
  loader: ({ context }) => readImportsPage({ data: context.owner.person }),
  component: MyImportsRoute,
})

function MyImportsRoute() {
  const { owner } = Route.useRouteContext()
  const { feito, erro, novos, fora } = Route.useSearch()
  return (
    <PersonImportsScreen
      slug={owner.person}
      page={Route.useLoaderData()}
      done={feito && { notice: feito, facts: novos ?? 0, outside: fora }}
      refusal={erro}
    />
  )
}
