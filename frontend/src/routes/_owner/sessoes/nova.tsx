import { createFileRoute } from '@tanstack/react-router'
import { isNoteToken } from '#/content/billboard-reply'
import { searchFor, searchParam, similarParam } from '#/content/catalog-search'
import { isSessionRequestRefusal } from '#/content/session-request'
import { draftFor, readRequestOptions } from '#/content/sessions'
import { NewSession } from '#/ui/new-session'

export const Route = createFileRoute('/_owner/sessoes/nova')({
  validateSearch: (search) => ({
    erro: isSessionRequestRefusal(search.erro) ? search.erro : undefined,
    buscar: searchParam(search.buscar),
    parecido: similarParam(search.parecido),
    nota: isNoteToken(search.nota) ? search.nota : undefined,
  }),
  loaderDeps: ({ search }) => ({ buscar: search.buscar, nota: search.nota }),
  loader: async ({ deps }) => {
    const [options, search, draft] = await Promise.all([
      readRequestOptions(),
      searchFor(deps.buscar, 'films'),
      draftFor(deps.nota),
    ])
    return { options, search, draft }
  },
  component: NewSessionPage,
})

function NewSessionPage() {
  const { erro, parecido, nota } = Route.useSearch()
  const { options, search, draft } = Route.useLoaderData()
  return (
    <NewSession
      options={options}
      draft={draft}
      note={draft ? nota : undefined}
      refusal={erro}
      search={search}
      similar={parecido}
    />
  )
}
