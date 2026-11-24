import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { readOwner } from '#/content/owner'

// The Dono gate for the pages: every route under `_owner/` needs a Dono
// logged in, and the others go to `/entrar`. Server functions check again on
// their own (`content/owner.ts`): a page gate does not protect them.
export const Route = createFileRoute('/_owner')({
  beforeLoad: async () => {
    const owner = await readOwner()
    if (!owner) throw redirect({ to: '/entrar', search: { recusa: undefined } })
    return { owner }
  },
  component: Outlet,
})
