import { createFileRoute } from '@tanstack/react-router'
import { readHome } from '#/content/home'
import { Home } from '#/ui/home'

export const Route = createFileRoute('/_owner/')({
  loader: () => readHome(),
  component: HomePage,
})

function HomePage() {
  const { owner } = Route.useRouteContext()
  return (
    <Home name={owner.name} admin={owner.admin} home={Route.useLoaderData()} />
  )
}
