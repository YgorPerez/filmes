import { createFileRoute } from '@tanstack/react-router'
import { moved, MOVED_TO } from '#/content/moved'

// The list of open Sessões moved in the layout pass (#219); the old path redirects.
export const Route = createFileRoute('/feedback/')({
  beforeLoad: ({ location }) =>
    moved(MOVED_TO.openSessions, location.searchStr),
})
