import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
  useMatches,
} from '@tanstack/react-router'
import { readPushAlert } from '#/content/operations'
import { NotFound } from '#/ui/lost'
import { AppShell } from '#/ui/shell'

// The Dono gate for the pages: every route under `_owner/` needs a Dono
// logged in, and the others go to `/entrar`. Server functions check again on
// their own (`content/owner.ts`): a page gate does not protect them. Every
// page sits in the app shell (`ui/shell.tsx`); an admin also sees there the
// strip of a push that keeps failing. An address under it that leads
// nowhere (or a page only an admin opens) is the 404 inside the shell.
export const Route = createFileRoute('/_owner')({
  beforeLoad: ({ context: { owner } }) => {
    if (!owner) throw redirect({ to: '/entrar', search: { recusa: undefined } })
    return { owner }
  },
  loader: ({ context }) => (context.owner.admin ? readPushAlert() : null),
  component: OwnerLayout,
  notFoundComponent: OwnerNotFound,
})

/** The 404 inside the shell, with the bar and the tabs: the Dono is still
 * in the app (an old link to a page only an admin opens lands here). No
 * place is marked current: the address leads nowhere, and marking the
 * avatar on `/operacoes` would say the page is there. */
function OwnerNotFound() {
  const { owner } = Route.useRouteContext()
  return (
    <AppShell owner={owner} path="" alert={null}>
      <NotFound />
    </AppShell>
  )
}

function OwnerLayout() {
  const { owner } = Route.useRouteContext()
  const { pathname } = useLocation()
  // A two-column page says so in its route's `staticData`.
  const wide = useMatches({
    select: (matches) => matches.some((match) => match.staticData.wide),
  })
  return (
    <AppShell
      owner={owner}
      path={pathname}
      alert={Route.useLoaderData()}
      wide={wide}
    >
      <Outlet />
    </AppShell>
  )
}
