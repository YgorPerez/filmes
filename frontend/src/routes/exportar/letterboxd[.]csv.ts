import { createFileRoute } from '@tanstack/react-router'

// The Letterboxd CSV (#286), as `imdb[.]csv.ts` serves the IMDb one:
// `csvDownload` checks the Dono itself, and the engine stays out of the
// browser bundle.
export const Route = createFileRoute('/exportar/letterboxd.csv')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { serveCsvDownload } = await import('#/platform/export')
        return serveCsvDownload(request, 'letterboxd')
      },
    },
  },
})
