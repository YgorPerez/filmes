import { createFileRoute } from '@tanstack/react-router'
import { searchFor, searchParam, similarParam } from '#/content/catalog-search'
import { isSessionRequestRefusal } from '#/content/session-request'
import { readRequestOptions } from '#/content/sessions'
import { NewSession } from '#/ui/sessions'

export const Route = createFileRoute('/_owner/sessoes/nova')({
  validateSearch: (search) => ({
    erro: isSessionRequestRefusal(search.erro) ? search.erro : undefined,
    buscar: searchParam(search.buscar),
    parecido: similarParam(search.parecido),
  }),
  loaderDeps: ({ search }) => ({ buscar: search.buscar }),
  loader: async ({ deps }) => {
    const [options, search] = await Promise.all([
      readRequestOptions(),
      searchFor(deps.buscar, 'films'),
    ])
    return { options, search }
  },
  component: NewSessionPage,
})

function NewSessionPage() {
  const { erro, parecido } = Route.useSearch()
  const { options, search } = Route.useLoaderData()
  return (
    <NewSession
      options={options}
      refusal={erro}
      search={search}
      similar={parecido}
    />
  )
}
