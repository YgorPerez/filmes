import { createFileRoute } from '@tanstack/react-router'
import { readHome } from '#/content/sessions'
import { Home } from '#/ui/home'
import { PAGE_TITLES, titled } from '#/ui/page-title'

export const Route = createFileRoute('/_owner/')({
  loader: () => readHome(),
  head: () => titled(PAGE_TITLES.home),
  component: HomePage,
})

function HomePage() {
  return <Home home={Route.useLoaderData()} />
}
