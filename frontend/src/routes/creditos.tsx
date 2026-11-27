import { createFileRoute } from '@tanstack/react-router'
import { readCredits } from '#/content/credits'
import { Credits } from '#/ui/credits'
import { CREDITS_PATH } from '#/ui/kit/site-footer'
import { AppShell, OutsideShell } from '#/ui/shell'

// The sources' credits (#292), open to anyone: the footer of every page
// links here. A Dono reads them in the app shell, with no tab marked, so
// following the footer does not look like signing out; anyone else gets
// the bar with "filmes" alone. Either way the footer's link to here is
// marked as the current page.
export const Route = createFileRoute('/creditos')({
  loader: () => readCredits(),
  component: CreditsPage,
})

function CreditsPage() {
  const { owner } = Route.useRouteContext()
  const page = <Credits credits={Route.useLoaderData()} />
  if (!owner) return <OutsideShell path={CREDITS_PATH}>{page}</OutsideShell>
  return (
    <AppShell owner={owner} path={CREDITS_PATH} alert={null}>
      {page}
    </AppShell>
  )
}
