import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { readPushAlert } from '#/content/operations'
import { readOwner } from '#/content/owner'
import { PushBanner } from '#/ui/operations-push'

// The Dono gate for the pages: every route under `_owner/` needs a Dono
// logged in, and the others go to `/entrar`. Server functions check again on
// their own (`content/owner.ts`): a page gate does not protect them. An
// admin also sees, on every page, the banner of a push that keeps failing.
export const Route = createFileRoute('/_owner')({
  beforeLoad: async () => {
    const owner = await readOwner()
    if (!owner) throw redirect({ to: '/entrar', search: { recusa: undefined } })
    return { owner }
  },
  loader: ({ context }) => (context.owner.admin ? readPushAlert() : null),
  component: OwnerLayout,
})

function OwnerLayout() {
  const alert = Route.useLoaderData()
  return (
    <>
      {alert && <PushBanner status={alert} />}
      <Outlet />
    </>
  )
}
