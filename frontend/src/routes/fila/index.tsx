import { createFileRoute } from '@tanstack/react-router'
import { moved, MOVED_TO } from '#/content/moved'

// The resolution queue moved in the layout pass (#219); the old path redirects.
export const Route = createFileRoute('/fila/')({
  beforeLoad: ({ location }) => moved(MOVED_TO.queue, location.searchStr),
})
