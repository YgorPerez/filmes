import { createFileRoute } from '@tanstack/react-router'
import { readQueue } from '#/content/imports'
import { queueSearch } from '#/content/queue-search'
import { QueueScreen } from '#/ui/queue'
import { PAGE_TITLES, titled } from '#/ui/page-title'

export const Route = createFileRoute('/_owner/meu-gosto/fila')({
  validateSearch: queueSearch,
  loader: () => readQueue(),
  head: () => titled(PAGE_TITLES.queue),
  component: QueueRoute,
})

function QueueRoute() {
  const { feito, erro, resolvidos, restam } = Route.useSearch()
  return (
    <QueueScreen
      queue={Route.useLoaderData()}
      done={feito && { notice: feito, resolved: resolvidos, left: restam }}
      refusal={erro}
    />
  )
}
