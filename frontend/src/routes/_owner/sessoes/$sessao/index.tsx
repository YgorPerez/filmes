import { createFileRoute, notFound } from '@tanstack/react-router'
import {
  isNoteToken,
  isReplyRefusal,
  isSessionNotice,
} from '#/content/billboard-reply'
import { readSessionPage } from '#/content/sessions'
import { NotFound } from '#/ui/lost'
import { SessionScreen } from '#/ui/sessions'

export const Route = createFileRoute('/_owner/sessoes/$sessao/')({
  validateSearch: (search) => ({
    feito: isSessionNotice(search.feito) ? search.feito : undefined,
    erro: isReplyRefusal(search.erro) ? search.erro : undefined,
    nota: isNoteToken(search.nota) ? search.nota : undefined,
  }),
  loaderDeps: ({ search }) => ({ nota: search.nota }),
  // A post loads the page again itself, once (`useFetchForm`). A Sessão
  // that does not exist is the 404 (status and page), not a page that
  // says so.
  loader: async ({ params, deps }) => {
    const page = await readSessionPage({
      data: { session: params.sessao, note: deps.nota },
    })
    if (page === 'unknown') throw notFound()
    return page
  },
  component: SessionRoute,
  notFoundComponent: () => <NotFound what="session" />,
})

function SessionRoute() {
  const { feito, erro } = Route.useSearch()
  return (
    <SessionScreen page={Route.useLoaderData()} notice={feito} refusal={erro} />
  )
}
