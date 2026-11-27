import { createFileRoute, redirect } from '@tanstack/react-router'
import { isLoginRefusal } from '#/content/login-refusal'
import { Login } from '#/ui/login'

export const Route = createFileRoute('/entrar')({
  validateSearch: (search) => ({
    recusa: isLoginRefusal(search.recusa) ? search.recusa : undefined,
  }),
  // A Dono already logged in has nothing to do here.
  beforeLoad: ({ context }) => {
    if (context.owner) throw redirect({ to: '/' })
  },
  component: LoginPage,
})

function LoginPage() {
  const { recusa } = Route.useSearch()
  return <Login refusal={recusa} />
}
