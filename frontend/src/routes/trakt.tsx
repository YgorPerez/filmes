import { createFileRoute } from '@tanstack/react-router'
import { readTraktPage } from '#/content/trakt'
import { isTraktError } from '#/content/trakt-form'
import { TraktScreen } from '#/ui/login'
import { AppShell } from '#/ui/shell'

// `/trakt` (#295): any Pessoa with an email connects her Trakt here. A
// Dono sees it in the app shell, with the way back to Importar (#274);
// anyone else, on its own.
export const Route = createFileRoute('/trakt')({
  validateSearch: (search) => ({
    erro: isTraktError(search.erro) ? search.erro : undefined,
  }),
  loader: () => readTraktPage(),
  component: TraktRoute,
})

function TraktRoute() {
  const { owner } = Route.useRouteContext()
  const page = Route.useLoaderData()
  const error = Route.useSearch().erro
  if (!owner) return <TraktScreen page={page} error={error} />
  return (
    <AppShell owner={owner} path="/trakt" alert={null}>
      <TraktScreen page={page} error={error} inApp />
    </AppShell>
  )
}
