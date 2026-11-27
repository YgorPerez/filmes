import { createFileRoute } from '@tanstack/react-router'
import { isPeopleNotice, isPeopleRefusal } from '#/content/person-action'
import {
  isPersonCreateRefusal,
  typedOfQuery,
  typedQuery,
} from '#/content/person-create'
import { readPeopleList } from '#/content/people'
import { PeopleList } from '#/ui/people'

export const Route = createFileRoute('/_owner/pessoas/')({
  // `erro=pessoa`: a form's Pessoa is gone; `erro=baixar`, a download's;
  // `feito=removida`: one was taken out. Any other reason is the create
  // form's, which comes back with what was typed.
  validateSearch: (search) => {
    const erro =
      isPeopleRefusal(search.erro) || isPersonCreateRefusal(search.erro)
        ? search.erro
        : undefined
    const feito = isPeopleNotice(search.feito) ? search.feito : undefined
    if (!isPersonCreateRefusal(erro)) return { erro, feito }
    return { erro, feito, ...typedQuery(search) }
  },
  loader: () => readPeopleList(),
  component: PeoplePage,
})

function PeoplePage() {
  const { erro, feito, ...query } = Route.useSearch()
  const { owner } = Route.useRouteContext()
  return (
    <PeopleList
      people={Route.useLoaderData()}
      self={owner.person}
      gone={isPeopleRefusal(erro) ? erro : undefined}
      removed={feito === 'removida'}
      admin={owner.admin}
      create={
        isPersonCreateRefusal(erro)
          ? { refusal: erro, typed: typedOfQuery(query) }
          : undefined
      }
    />
  )
}
