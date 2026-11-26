import { createFileRoute } from '@tanstack/react-router'
import { moved, MOVED_TO } from '#/content/moved'

// The Dono's imports moved in the layout pass (#219); the old path redirects.
export const Route = createFileRoute('/importar/')({
  beforeLoad: ({ location }) => moved(MOVED_TO.imports, location.searchStr),
})
