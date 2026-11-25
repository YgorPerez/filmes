import { createFileRoute } from '@tanstack/react-router'
import { isPeopleRefusal } from '#/content/person-action'
import { readPeopleList } from '#/content/people'
import { PeopleList } from '#/ui/people'

export const Route = createFileRoute('/_owner/pessoas/')({
  validateSearch: (search) => ({
    erro: isPeopleRefusal(search.erro) ? search.erro : undefined,
  }),
  loader: () => readPeopleList(),
  component: PeoplePage,
})

function PeoplePage() {
  const { erro } = Route.useSearch()
  return <PeopleList people={Route.useLoaderData()} gone={erro === 'pessoa'} />
}
