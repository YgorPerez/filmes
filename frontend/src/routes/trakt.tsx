import { createFileRoute } from '@tanstack/react-router'
import { readTraktPage } from '#/content/trakt'
import { isTraktError } from '#/content/trakt-form'
import { TraktScreen } from '#/ui/trakt'

export const Route = createFileRoute('/trakt')({
  validateSearch: (search) => ({
    erro: isTraktError(search.erro) ? search.erro : undefined,
  }),
  loader: () => readTraktPage(),
  component: TraktRoute,
})

function TraktRoute() {
  return (
    <TraktScreen page={Route.useLoaderData()} error={Route.useSearch().erro} />
  )
}
