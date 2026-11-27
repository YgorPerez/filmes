import { createFileRoute } from '@tanstack/react-router'
import { isNoteToken } from '#/content/billboard-reply'
import { filmParam, searchFor, searchParam } from '#/content/catalog-search'
import { isFeedbackRefusal } from '#/content/feedback-form'
import {
  feedbackDraftFor,
  readFeedbackCorrection,
  readFeedbackPage,
  withCorrection,
} from '#/content/feedback'
import { readSessions, toldSession } from '#/content/sessions'
import { FeedbackScreen } from '#/ui/feedback'

export const Route = createFileRoute('/_owner/sessoes/$sessao/contar')({
  validateSearch: (search) => ({
    erro: isFeedbackRefusal(search.erro) ? search.erro : undefined,
    buscar: searchParam(search.buscar),
    filme: filmParam(search.filme),
    nota: isNoteToken(search.nota) ? search.nota : undefined,
    // Correct a told Session (#344): the form, filled with what was told.
    corrigir: search.corrigir === 'sim' ? ('sim' as const) : undefined,
  }),
  loaderDeps: ({ search }) => ({
    buscar: search.buscar,
    nota: search.nota,
    corrigir: search.corrigir,
    filme: search.filme,
  }),
  loader: async ({ params, deps }) => {
    const [opened, search, draft, correction] = await Promise.all([
      readFeedbackPage({ data: params.sessao }),
      searchFor(deps.buscar, 'films'),
      feedbackDraftFor(deps.nota),
      deps.corrigir ? readFeedbackCorrection({ data: params.sessao }) : null,
    ])
    const form = withCorrection(opened, draft, correction, deps.filme)
    // No open Session by that id: a told one says what they saw (#272).
    const told =
      form.page === 'unknown'
        ? toldSession(await readSessions({ data: false }), params.sessao)
        : undefined
    return { ...form, search, told }
  },
  component: FeedbackRoute,
})

function FeedbackRoute() {
  const { sessao } = Route.useParams()
  const { erro, filme, nota } = Route.useSearch()
  const data = Route.useLoaderData()
  return (
    <FeedbackScreen
      session={sessao}
      page={data.page}
      refusal={erro}
      search={data.search}
      film={'film' in data ? data.film : filme}
      nothing={'nothing' in data && data.nothing}
      draft={data.draft}
      note={data.noted ? nota : undefined}
      told={data.told}
      correcting={data.correcting}
    />
  )
}
