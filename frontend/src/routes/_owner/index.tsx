import { createFileRoute } from '@tanstack/react-router'
import { readHome } from '#/content/sessions'
import { Home } from '#/ui/home'

export const Route = createFileRoute('/_owner/')({
  loader: () => readHome(),
  component: HomePage,
})

function HomePage() {
  return <Home home={Route.useLoaderData()} />
}
