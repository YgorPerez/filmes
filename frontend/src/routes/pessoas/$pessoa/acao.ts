import { createFileRoute } from '@tanstack/react-router'

// The forms of a Pessoa's page post here. Outside `_owner/`, since the page
// gate runs for pages, not for server handlers: `personAction` checks the
// Dono itself. The import is inside the handler, so the browser bundle never
// sees the engine.
export const Route = createFileRoute('/pessoas/$pessoa/acao')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { servePersonAction } = await import('#/platform/people')
        return servePersonAction(request, params.pessoa)
      },
    },
  },
})
