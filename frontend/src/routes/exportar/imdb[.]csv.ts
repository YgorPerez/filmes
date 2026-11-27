import { createFileRoute } from '@tanstack/react-router'

// The download of `/exportar`: a GET the browser saves as a file. Outside
// `_owner/`, since the page gate runs for pages, not for server handlers:
// `csvDownload` checks the Dono itself. The import is inside the handler,
// so the browser bundle never sees the engine.
export const Route = createFileRoute('/exportar/imdb.csv')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { serveCsvDownload } = await import('#/platform/export')
        return serveCsvDownload(request, 'imdb')
      },
    },
  },
})
