import { createFileRoute } from '@tanstack/react-router'
import {
  countOf,
  isImportNotice,
  isImportRefusal,
} from '#/content/import-action'
import { readImportsPage } from '#/content/imports'
import { PersonImportsScreen } from '#/ui/person-imports'

export const Route = createFileRoute('/_owner/importar/$pessoa')({
  validateSearch: (search) => ({
    feito: isImportNotice(search.feito) ? search.feito : undefined,
    erro: isImportRefusal(search.erro) ? search.erro : undefined,
    novos: countOf(search.novos),
    fora: countOf(search.fora),
  }),
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
