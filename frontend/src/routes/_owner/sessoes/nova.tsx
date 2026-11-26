import { createFileRoute } from '@tanstack/react-router'
import { searchFor, searchParam, similarParam } from '#/content/catalog-search'
import {
  isSessionRequestRefusal,
  sentenceParam,
} from '#/content/session-request'
import { readingFor, readRequestOptions } from '#/content/sessions'
import { NewSession } from '#/ui/sessions'

export const Route = createFileRoute('/_owner/sessoes/nova')({
  validateSearch: (search) => ({
    erro: isSessionRequestRefusal(search.erro) ? search.erro : undefined,
    buscar: searchParam(search.buscar),
    parecido: similarParam(search.parecido),
    frase: sentenceParam(search.frase),
  }),
  loaderDeps: ({ search }) => ({ buscar: search.buscar, frase: search.frase }),
  loader: async ({ deps }) => {
    const [options, search, reading] = await Promise.all([
      readRequestOptions(),
      searchFor(deps.buscar, 'films'),
      readingFor(deps.frase),
    ])
    return { options, search, reading }
  },
  component: NewSessionPage,
})

function NewSessionPage() {
  const { erro, parecido } = Route.useSearch()
  const { options, search, reading } = Route.useLoaderData()
  return (
    <NewSession
      options={options}
      reading={reading}
      refusal={erro}
      search={search}
      similar={parecido}
    />
  )
}
