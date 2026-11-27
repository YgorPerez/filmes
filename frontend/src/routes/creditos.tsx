import { createFileRoute } from '@tanstack/react-router'
import { readCredits } from '#/content/credits'
import { Credits } from '#/ui/credits'

// The sources' credits (#292), open to anyone: the footer of every page
// links here.
export const Route = createFileRoute('/creditos')({
  loader: () => readCredits(),
  component: CreditsPage,
})

function CreditsPage() {
  return <Credits credits={Route.useLoaderData()} />
}
