import { createFileRoute } from '@tanstack/react-router'
import { answerFetch } from '#/content/fetch-answer'

// The rating screen's Pronto posts here. Outside `_owner/`, since the page
// gate runs for pages, not for server handlers: `rateAction` checks the
// Dono itself. The import is inside the handler, so the browser bundle never
// sees the engine. A post by `fetch` gets `{ to }` (`answerFetch`).
export const Route = createFileRoute('/notas/enviar')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { serveRate } = await import('#/platform/imports')
        return answerFetch(request, await serveRate(request))
      },
    },
  },
})
