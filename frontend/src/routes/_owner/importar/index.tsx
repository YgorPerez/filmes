import { createFileRoute } from '@tanstack/react-router'
import { readImportsOverview } from '#/content/imports'
import { ImportsList } from '#/ui/imports'

export const Route = createFileRoute('/_owner/importar/')({
  validateSearch: (search) => ({
    erro: search.erro === 'pessoa' ? ('pessoa' as const) : undefined,
  }),
  loader: () => readImportsOverview(),
  component: ImportsPage,
})

function ImportsPage() {
  const { erro } = Route.useSearch()
  return (
    <ImportsList overview={Route.useLoaderData()} gone={erro === 'pessoa'} />
  )
}
