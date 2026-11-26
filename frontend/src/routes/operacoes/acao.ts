import { createFileRoute } from '@tanstack/react-router'
import { answerFetch } from '#/content/fetch-answer'

// The Operações forms post here. Outside `_owner/`: `operationsAction`
// checks the admin Dono itself.
export const Route = createFileRoute('/operacoes/acao')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { serveOperationsAction } = await import('#/platform/operations')
        return answerFetch(request, await serveOperationsAction(request))
      },
    },
  },
})
