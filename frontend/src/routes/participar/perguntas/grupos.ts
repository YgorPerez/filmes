import { createFileRoute } from '@tanstack/react-router'

// The groups a Presente picks before the Perguntas par a par post here
// (#415). A server handler, like `enviar.ts`: `groupPickAction` checks the
// link itself, and the engine stays out of the browser bundle.
export const Route = createFileRoute('/participar/perguntas/grupos')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { serveGroupPick } = await import('#/platform/billboard')
        return serveGroupPick(request)
      },
    },
  },
})
