import { createFileRoute } from '@tanstack/react-router'
import { isPeopleRefusal } from '#/content/person-action'
import {
  isPersonCreateRefusal,
  typedOfQuery,
  typedQuery,
} from '#/content/person-create'
import { readPeopleList } from '#/content/people'
import { PeopleList } from '#/ui/people'

export const Route = createFileRoute('/_owner/pessoas/')({
  // `erro=pessoa`: a form's Pessoa is gone. Any other reason is the create
  // form's, which comes back with what was typed.
  validateSearch: (search) => {
    const erro =
      isPeopleRefusal(search.erro) || isPersonCreateRefusal(search.erro)
        ? search.erro
        : undefined
    if (!isPersonCreateRefusal(erro)) return { erro }
    return { erro, ...typedQuery(search) }
  },
  loader: () => readPeopleList(),
  component: PeoplePage,
})

function PeoplePage() {
  const { erro, ...query } = Route.useSearch()
  return (
    <PeopleList
      people={Route.useLoaderData()}
      gone={erro === 'pessoa'}
      create={
        isPersonCreateRefusal(erro)
          ? { refusal: erro, typed: typedOfQuery(query) }
          : undefined
      }
    />
  )
}
