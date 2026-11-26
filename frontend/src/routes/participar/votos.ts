import { createFileRoute } from '@tanstack/react-router'

// The group swipe's deck posts here (#182). `voteAction` revalidates the
// Link da Sessão itself; the import is inside the handler, so the browser
// bundle never sees the engine.
export const Route = createFileRoute('/participar/votos')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { serveVotes } = await import('#/platform/billboard')
        return serveVotes(request)
      },
    },
  },
})
