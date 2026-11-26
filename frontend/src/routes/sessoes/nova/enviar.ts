import { createFileRoute } from '@tanstack/react-router'
import { answerFetch } from '#/content/fetch-answer'

// The "Nova Sessão" form posts here. Outside `_owner/`, since the page gate
// runs for pages, not for server handlers: `sessionRequestAction` checks the
// Dono itself. The import is inside the handler, so the browser bundle never
// sees the engine. A post by `fetch` gets `{ to }` (`answerFetch`).
export const Route = createFileRoute('/sessoes/nova/enviar')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { serveSessionRequest } = await import('#/platform/sessions')
        return answerFetch(request, await serveSessionRequest(request))
      },
    },
  },
})
