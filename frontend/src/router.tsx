import { createRouter, useRouter } from '@tanstack/react-router'
import { LoadFailed, NotFound } from './ui/lost'
import { OutsideShell } from './ui/shell'
import { routeTree } from './routeTree.gen'

// The server creates one router per request. An address that leads nowhere
// outside the app shell gets the 404 with its own bar (`_owner` has the one
// inside the shell); a page that fails to open, the error with Tentar de
// novo, which loads it again.
export function getRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultNotFoundComponent: () => (
      <OutsideShell>
        <NotFound owner={false} />
      </OutsideShell>
    ),
    defaultErrorComponent: Failed,
  })
}

function Failed() {
  const router = useRouter()
  return <LoadFailed onRetry={() => void router.invalidate()} />
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
  interface StaticDataRouteOption {
    /** The page's column is 1040px from 900px: the shell's bar and footer
     * take its width (`AppShell`'s `wide`). */
    wide?: boolean
  }
}
