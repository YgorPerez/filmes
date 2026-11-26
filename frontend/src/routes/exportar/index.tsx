import { createFileRoute } from '@tanstack/react-router'
import { moved, MOVED_TO } from '#/content/moved'

// The export moved in the layout pass (#219); the old path redirects.
export const Route = createFileRoute('/exportar/')({
  beforeLoad: ({ location }) => moved(MOVED_TO.export, location.searchStr),
})
