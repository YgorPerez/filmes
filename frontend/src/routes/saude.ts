import { createFileRoute } from '@tanstack/react-router'

// Whether the app can serve from its database (`health` in `platform/operations.ts`), for
// the deploy's probe and for a look from outside. The import is inside the
// handler, so the browser bundle never sees the engine.
export const Route = createFileRoute('/saude')({
  server: {
    handlers: {
      GET: async () => {
        const { serveHealth } = await import('#/platform/operations')
        return serveHealth()
      },
    },
  },
})
