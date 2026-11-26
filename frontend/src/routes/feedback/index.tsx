import { createFileRoute } from '@tanstack/react-router'
import { moved } from '#/content/moved'
import { PENDING_FEEDBACK_FILTER, SESSIONS_PATH } from '#/content/session-paths'

export const Route = createFileRoute('/feedback/')({
  beforeLoad: ({ location }) => {
    const search = new URLSearchParams(location.searchStr)
    search.set('filtro', PENDING_FEEDBACK_FILTER)
    moved(SESSIONS_PATH, `?${search}`)
  },
})
