import { createFileRoute } from '@tanstack/react-router'
import { answerFetch } from '#/content/fetch-answer'

// The forms of a Pessoa's imports page post here (an upload is multipart).
// Outside `_owner/`, since the page gate runs for pages, not for server
// handlers: `importAction` checks the Dono itself. The import is inside the
// handler, so the browser bundle never sees the engine. A post by `fetch` gets `{ to }` (`answerFetch`).
export const Route = createFileRoute('/importar/$pessoa/acao')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { serveImportAction } = await import('#/platform/imports')
        return answerFetch(
          request,
          await serveImportAction(request, params.pessoa),
        )
      },
    },
  },
})
