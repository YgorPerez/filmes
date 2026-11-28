import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/sessoes/$sessao/editar-presentes')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { serveAttendeeEdit } = await import('#/platform/edit-attendees')
        return serveAttendeeEdit(request, params.sessao)
      },
    },
  },
})
