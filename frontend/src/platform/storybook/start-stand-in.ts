// The stories' `@tanstack/react-start` (`.storybook/vite.config.ts`). On the
// app, the Start plugin swaps each `createServerFn` for a request to the
// server; Storybook has neither the plugin nor the server. A piece's module
// may still define a server function next to what the piece uses
// (`content/catalog-search.ts` next to `similarParam`): here the definition
// works and the call refuses, since no story calls the server.
//
// Only what the app uses: `createServerFn().middleware().validator().handler()`
// and `createMiddleware().server()`.

const refuse = () =>
  Promise.reject(new Error('No server function runs in Storybook.'))

interface ServerFnBuilder {
  middleware: (middleware: readonly unknown[]) => ServerFnBuilder
  validator: (validate: unknown) => ServerFnBuilder
  handler: (handler: unknown) => typeof refuse
}

const builder: ServerFnBuilder = {
  middleware: () => builder,
  validator: () => builder,
  handler: () => refuse,
}

export const createServerFn = (_options?: { method?: string }) => builder

export const createMiddleware = (_options?: { type?: string }) => ({
  server: (server: unknown) => ({ server }),
})
