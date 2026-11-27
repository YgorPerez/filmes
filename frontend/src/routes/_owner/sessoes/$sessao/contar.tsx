import { createFileRoute } from '@tanstack/react-router'
import { isNoteToken } from '#/content/billboard-reply'
import { filmParam, searchFor, searchParam } from '#/content/catalog-search'
import { isFeedbackRefusal } from '#/content/feedback-form'
import {
  feedbackDraftFor,
  readFeedbackCorrection,
  readFeedbackPage,
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
  }),
  loader: async ({ params, deps }) => {
    const [opened, search, draft, correction] = await Promise.all([
      readFeedbackPage({ data: params.sessao }),
      searchFor(deps.buscar, 'films'),
      feedbackDraftFor(deps.nota),
      deps.corrigir ? readFeedbackCorrection({ data: params.sessao }) : null,
    ])
    const fix =
      correction !== null && typeof correction === 'object'
        ? correction
        : undefined
    const page = fix ? fix.page : opened
    // No open Session by that id: a told one says what they saw (#272).
    const told =
      page === 'unknown'
        ? toldSession(await readSessions({ data: false }), params.sessao)
        : undefined
    return {
      page,
      search,
      // What the search kept wins over what was told.
      draft: draft ?? fix?.draft ?? null,
      noted: draft !== null,
      told,
      correcting: fix ? { film: fix.film } : undefined,
    }
  },
  component: FeedbackRoute,
})

function FeedbackRoute() {
  const { sessao } = Route.useParams()
  const { erro, filme, nota } = Route.useSearch()
  const { page, search, draft, noted, told, correcting } = Route.useLoaderData()
  return (
    <FeedbackScreen
      session={sessao}
      page={page}
      refusal={erro}
      search={search}
      film={filme ?? correcting?.film ?? undefined}
      nothing={correcting !== undefined && correcting.film === null && !filme}
      draft={draft}
      note={noted ? nota : undefined}
      told={told}
      correcting={correcting !== undefined}
    />
  )
}
