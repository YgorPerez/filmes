import { createFileRoute, redirect } from '@tanstack/react-router'
import { isLoginRefusal } from '#/content/login-refusal'
import { readOwner } from '#/content/owner'
import { Login } from '#/ui/login'
import { PAGE_TITLES, titled } from '#/ui/page-title'

export const Route = createFileRoute('/entrar')({
  validateSearch: (search) => ({
    recusa: isLoginRefusal(search.recusa) ? search.recusa : undefined,
  }),
  // A Dono already logged in has nothing to do here.
  beforeLoad: async () => {
    if (await readOwner()) throw redirect({ to: '/' })
  },
  head: () => titled(PAGE_TITLES.signIn),
  component: LoginPage,
})

function LoginPage() {
  const { recusa } = Route.useSearch()
  return <Login refusal={recusa} />
}
