import { createFileRoute } from '@tanstack/react-router'
import { Home } from '#/ui/home'

export const Route = createFileRoute('/_owner/')({ component: HomePage })

function HomePage() {
  const { owner } = Route.useRouteContext()
  return <Home name={owner.name} admin={owner.admin} />
}
