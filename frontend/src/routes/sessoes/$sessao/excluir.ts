import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/sessoes/$sessao/excluir')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { serveSessionDeletion } =
          await import('#/platform/session-delete')
        return serveSessionDeletion(request, params.sessao)
      },
    },
  },
})
