import { createFileRoute } from '@tanstack/react-router'
import { moved, MOVED_TO } from '#/content/moved'

// A Sessão's Feedback moved in the layout pass (#219); the old path redirects.
export const Route = createFileRoute('/feedback/$sessao/')({
  beforeLoad: ({ params, location }) =>
    moved(MOVED_TO.feedback(params.sessao), location.searchStr),
})
