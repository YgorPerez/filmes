import { createFileRoute } from '@tanstack/react-router'

// The home's "pular" posts here (`setupSkipAction`). Outside `_owner/`,
// since the page gate runs for pages, not for server handlers: the action
// checks the Dono itself. The import is inside the handler, so the browser
// bundle never sees the engine.
export const Route = createFileRoute('/inicio/pular')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { serveSetupSkip } = await import('#/platform/setup-guide')
        return serveSetupSkip(request)
      },
    },
  },
})
