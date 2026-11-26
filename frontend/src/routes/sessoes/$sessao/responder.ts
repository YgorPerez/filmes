import { createFileRoute } from '@tanstack/react-router'
import { answerFetch } from '#/content/fetch-answer'

// The Cartaz's Enviar posts here. Outside `_owner/`, since the page gate runs
// for pages, not for server handlers: `replyAction` checks the Dono itself.
// The import is inside the handler, so the browser bundle never sees the
// engine.
export const Route = createFileRoute('/sessoes/$sessao/responder')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { serveReply } = await import('#/platform/billboard')
        return answerFetch(request, await serveReply(request, params.sessao))
      },
    },
  },
})
