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
    // The home's "Pedir de novo": the form filled as that Sessão asked.
    repetir:
      typeof search.repetir === 'string' && search.repetir !== ''
        ? search.repetir
        : undefined,
    presentes: peopleParam(search.presentes),
  }),
  loaderDeps: ({ search }) => ({
    buscar: search.buscar,
    nota: search.nota,
    repetir: search.repetir,
  }),
  loader: async ({ deps }) => {
    const [options, search, draft] = await Promise.all([
      readRequestOptions(),
      searchFor(deps.buscar, 'films'),
      draftFor(deps.nota, deps.repetir),
    ])
    return { options, search, draft }
  },
  component: NewSessionPage,
})

/** `?presentes=bruno,iara`: the group to start with (#272). Kept as the
 * text it came in: an array here would be written back to the URL as JSON,
 * and the server's redirect to that URL lost the group. */
function peopleParam(value: unknown): string | undefined {
  const text = Array.isArray(value) ? value.join(',') : value
  if (typeof text !== 'string') return undefined
  const slugs = text.split(',').filter((slug) => /^[\w-]{1,64}$/.test(slug))
  return slugs.length > 0 ? slugs.slice(0, 20).join(',') : undefined
}

function NewSessionPage() {
  const { erro, parecido, nota, repetir, presentes } = Route.useSearch()
  const { options, search, draft } = Route.useLoaderData()
  return (
    <NewSession
      options={options}
      draft={draft}
      note={draft ? (nota ?? repetir) : undefined}
      refusal={erro}
      search={search}
      similar={parecido}
      attendees={presentes?.split(',')}
    />
  )
}
