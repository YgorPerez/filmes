import { createFileRoute } from '@tanstack/react-router'

// The queue's forms post here. Outside `_owner/`: `queueAction` checks the
// Dono itself.
export const Route = createFileRoute('/fila/acao')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { serveQueueAction } = await import('#/platform/imports')
        return serveQueueAction(request)
      },
    },
  },
})
