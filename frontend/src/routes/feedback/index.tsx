import { createFileRoute } from '@tanstack/react-router'
import { moved, MOVED_TO } from '#/content/moved'

export const Route = createFileRoute('/feedback/')({
  beforeLoad: ({ location }) => {
    const search = new URLSearchParams(location.searchStr)
    moved(MOVED_TO.pendingFeedback(search), '')
  },
})
