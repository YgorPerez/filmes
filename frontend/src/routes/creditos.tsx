import { createFileRoute } from '@tanstack/react-router'
import { readCredits } from '#/content/credits'
import { Credits } from '#/ui/credits'
import { AppShell, OutsideShell } from '#/ui/shell'

// The sources' credits (#292), open to anyone: the footer of every page
// links here. A Dono reads them in the app shell, with no tab marked, so
// following the footer does not look like signing out; anyone else gets
// the bar with "filmes" alone.
export const Route = createFileRoute('/creditos')({
  loader: () => readCredits(),
  component: CreditsPage,
})

function CreditsPage() {
  const { owner } = Route.useRouteContext()
  const page = <Credits credits={Route.useLoaderData()} />
  if (!owner) return <OutsideShell>{page}</OutsideShell>
  return (
    <AppShell owner={owner} path="" alert={null}>
      {page}
    </AppShell>
  )
}
