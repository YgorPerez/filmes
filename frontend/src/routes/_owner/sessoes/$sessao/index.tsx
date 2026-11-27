import { createFileRoute } from '@tanstack/react-router'
import {
  isNoteToken,
  isReplyRefusal,
  isSessionNotice,
} from '#/content/billboard-reply'
import { readSessionPage } from '#/content/sessions'
import { SessionScreen } from '#/ui/sessions'
import { PAGE_TITLES, titled } from '#/ui/page-title'

export const Route = createFileRoute('/_owner/sessoes/$sessao/')({
  validateSearch: (search) => ({
    feito: isSessionNotice(search.feito) ? search.feito : undefined,
    erro: isReplyRefusal(search.erro) ? search.erro : undefined,
    nota: isNoteToken(search.nota) ? search.nota : undefined,
  }),
  loaderDeps: ({ search }) => ({ nota: search.nota }),
  // A post loads the page again itself, once (`useFetchForm`).
  loader: ({ params, deps }) =>
    readSessionPage({ data: { session: params.sessao, note: deps.nota } }),
  head: ({ loaderData }) =>
    titled(
      loaderData && loaderData !== 'unknown'
        ? PAGE_TITLES.session(loaderData.session.date)
        : null,
    ),
  component: SessionRoute,
})

function SessionRoute() {
  const { feito, erro } = Route.useSearch()
  return (
    <SessionScreen page={Route.useLoaderData()} notice={feito} refusal={erro} />
  )
}
