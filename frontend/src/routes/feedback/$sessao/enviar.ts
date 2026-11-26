import { createFileRoute } from '@tanstack/react-router'
import { answerFetch } from '#/content/fetch-answer'

// The Feedback form posts here. Outside `_owner/`, since the page gate runs
// for pages, not for server handlers: `feedbackAction` checks the Dono
// itself. The import is inside the handler, so the browser bundle never sees
// the engine. A post by `fetch` gets `{ to }` (`answerFetch`).
export const Route = createFileRoute('/feedback/$sessao/enviar')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { serveFeedbackAction } = await import('#/platform/feedback')
        return answerFetch(
          request,
          await serveFeedbackAction(request, params.sessao),
        )
      },
    },
  },
})
