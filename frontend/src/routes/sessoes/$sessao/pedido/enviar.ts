import { createFileRoute } from '@tanstack/react-router'

// The edit form of an open Session (#372) posts here. Outside `_owner/`,
// since the page gate runs for pages, not for server handlers:
// `sessionEditAction` checks the Dono itself. The import is inside the
// handler, so the browser bundle never sees the engine.
export const Route = createFileRoute('/sessoes/$sessao/pedido/enviar')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { serveSessionEdit } = await import('#/platform/session-edit')
        return serveSessionEdit(request, params.sessao)
      },
    },
  },
})
