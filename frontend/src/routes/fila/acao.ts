import { createFileRoute } from '@tanstack/react-router'
import { answerFetch } from '#/content/fetch-answer'

// The queue's forms post here. Outside `_owner/`: `queueAction` checks the
// Dono itself. A post by `fetch` gets `{ to }` (`answerFetch`).
export const Route = createFileRoute('/fila/acao')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { serveQueueAction } = await import('#/platform/imports')
        return answerFetch(request, await serveQueueAction(request))
      },
    },
  },
})
