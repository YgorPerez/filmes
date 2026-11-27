import { createRouter, useRouter } from '@tanstack/react-router'
import { LoadFailed, LostAlone, NotFound } from './ui/lost'
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
      <LostAlone>
        <NotFound owner={false} />
      </LostAlone>
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
}
