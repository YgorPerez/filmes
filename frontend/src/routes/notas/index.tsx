import { createFileRoute } from '@tanstack/react-router'
import { moved, MOVED_TO } from '#/content/moved'

// The rating screen moved in the layout pass (#219); the old path redirects.
export const Route = createFileRoute('/notas/')({
  beforeLoad: ({ location }) => moved(MOVED_TO.ratings, location.searchStr),
})
