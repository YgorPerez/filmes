import { createFileRoute } from '@tanstack/react-router'
import { answerFetch } from '#/content/fetch-answer'

// The "Acrescentar Pessoa" form of `/pessoas` posts here. Outside `_owner/`,
// since the page gate runs for pages, not for server handlers:
// `personCreateAction` checks the Dono itself. The import is inside the
// handler, so the browser bundle never sees the engine.
export const Route = createFileRoute('/pessoas/nova/enviar')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { servePersonCreate } = await import('#/platform/people')
        return answerFetch(request, await servePersonCreate(request))
      },
    },
  },
})
