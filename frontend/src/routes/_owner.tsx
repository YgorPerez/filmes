import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
} from '@tanstack/react-router'
import { readPushAlert } from '#/content/operations'
import { readOwner } from '#/content/owner'
import { NotFound } from '#/ui/lost'
import { AppShell } from '#/ui/shell'

// The Dono gate for the pages: every route under `_owner/` needs a Dono
// logged in, and the others go to `/entrar`. Server functions check again on
// their own (`content/owner.ts`): a page gate does not protect them. Every
// page sits in the app shell (`ui/shell.tsx`); an admin also sees there the
// strip of a push that keeps failing. An address under it that leads
// nowhere (or a page only an admin opens) is the 404 inside the shell.
export const Route = createFileRoute('/_owner')({
  beforeLoad: async () => {
    const owner = await readOwner()
    if (!owner) throw redirect({ to: '/entrar', search: { recusa: undefined } })
    return { owner }
  },
  loader: ({ context }) => (context.owner.admin ? readPushAlert() : null),
  component: OwnerLayout,
  notFoundComponent: () => <NotFound />,
})

function OwnerLayout() {
  const { owner } = Route.useRouteContext()
  const { pathname } = useLocation()
  return (
    <AppShell owner={owner} path={pathname} alert={Route.useLoaderData()}>
      <Outlet />
    </AppShell>
  )
}
