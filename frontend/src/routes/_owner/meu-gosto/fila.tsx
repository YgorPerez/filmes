import { createFileRoute } from '@tanstack/react-router'
import { searchFor } from '#/content/catalog-search'
import { readQueue } from '#/content/imports'
import { queueSearch } from '#/content/queue-search'
import { QueueScreen } from '#/ui/queue'

export const Route = createFileRoute('/_owner/meu-gosto/fila')({
  validateSearch: queueSearch,
  loaderDeps: ({ search }) => ({ buscar: search.buscar, para: search.para }),
  loader: async ({ deps }) => {
    const [queue, search] = await Promise.all([
      readQueue(),
      deps.para === undefined ? null : searchFor(deps.buscar, 'films'),
    ])
    return { queue, search }
  },
  component: QueueRoute,
})

function QueueRoute() {
  const { feito, erro, resolvidos, restam, item, titulo, para } =
    Route.useSearch()
  const { queue, search } = Route.useLoaderData()
  return (
    <QueueScreen
      queue={queue}
      done={
        feito && {
          notice: feito,
          resolved: resolvidos,
          left: restam,
          item,
          title: titulo,
        }
      }
      refusal={erro}
      search={para && search ? { item: para, answer: search } : undefined}
    />
  )
}
