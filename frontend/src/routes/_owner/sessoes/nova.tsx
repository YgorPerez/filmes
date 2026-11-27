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
    presentes: peopleParam(search.presentes),
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

/** `?presentes=bruno,iara`: the group to start with (#272). */
function peopleParam(value: unknown): string[] | undefined {
  if (typeof value !== 'string') return undefined
  const slugs = value.split(',').filter((slug) => /^[\w-]{1,64}$/.test(slug))
  return slugs.length > 0 ? slugs.slice(0, 20) : undefined
}

function NewSessionPage() {
  const { erro, parecido, nota, presentes } = Route.useSearch()
  const { options, search, draft } = Route.useLoaderData()
  return (
    <NewSession
      options={options}
      draft={draft}
      note={draft ? nota : undefined}
      refusal={erro}
      search={search}
      similar={parecido}
      attendees={presentes}
    />
  )
}
