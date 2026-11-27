import { createFileRoute } from '@tanstack/react-router'
import { pairwisePath } from '#/content/pairwise-address'
import { votePath } from '#/content/session-votes-address'
import { LinkFilms } from '#/ui/session-link'

export const Route = createFileRoute('/participar/')({
  component: SessionLinkFilms,
})

function SessionLinkFilms() {
  const { participation } = Route.useRouteContext()
  const search = Route.useSearch()
  if (!participation?.selected || !search.chave) return null
  return (
    <LinkFilms
      view={participation}
      vote={{
        deck: votePath('votar', search),
        revote: votePath('votar', search, { mudar: true }),
      }}
      questions={pairwisePath(
        participation.session,
        search.chave,
        participation.selected.person,
      )}
    />
  )
}
