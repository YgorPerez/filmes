import { createFileRoute } from '@tanstack/react-router'
import { countOf, isQueueNotice, isQueueRefusal } from '#/content/import-action'
import { readQueue } from '#/content/imports'
import { QueueScreen } from '#/ui/queue'

export const Route = createFileRoute('/_owner/fila')({
  validateSearch: (search) => ({
    feito: isQueueNotice(search.feito) ? search.feito : undefined,
    erro: isQueueRefusal(search.erro) ? search.erro : undefined,
    resolvidos: countOf(search.resolvidos),
    restam: countOf(search.restam),
  }),
  loader: () => readQueue(),
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
