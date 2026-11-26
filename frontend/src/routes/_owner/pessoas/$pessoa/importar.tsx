import { createFileRoute } from '@tanstack/react-router'
import { readImportsPage } from '#/content/imports'
import { moved, MOVED_TO } from '#/content/moved'
import { importsSearch, PersonImportsScreen } from '#/ui/person-imports'

// A Pessoa's imports, under her page. The Dono's own are under Meu gosto.
export const Route = createFileRoute('/_owner/pessoas/$pessoa/importar')({
  validateSearch: importsSearch,
  beforeLoad: ({ params, context, location }) => {
    if (params.pessoa === context.owner.person)
      moved(MOVED_TO.imports, location.searchStr)
  },
  loader: ({ params }) => readImportsPage({ data: params.pessoa }),
  component: PersonImportsRoute,
})

function PersonImportsRoute() {
  const { pessoa } = Route.useParams()
  const { feito, erro, novos, fora } = Route.useSearch()
  return (
    <PersonImportsScreen
      slug={pessoa}
      page={Route.useLoaderData()}
      done={feito && { notice: feito, facts: novos ?? 0, outside: fora }}
      refusal={erro}
    />
  )
}
