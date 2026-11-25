import { createFileRoute } from '@tanstack/react-router'
import {
  isNoteToken,
  isReplyRefusal,
  isSessionNotice,
} from '#/content/billboard-reply'
import { readSessionPage } from '#/content/sessions'
import { SessionScreen } from '#/ui/sessions'

export const Route = createFileRoute('/_owner/sessoes/$sessao')({
  validateSearch: (search) => ({
    feito: isSessionNotice(search.feito) ? search.feito : undefined,
    erro: isReplyRefusal(search.erro) ? search.erro : undefined,
    nota: isNoteToken(search.nota) ? search.nota : undefined,
  }),
  loaderDeps: ({ search }) => ({ nota: search.nota }),
  loader: ({ params, deps }) =>
    readSessionPage({ data: { session: params.sessao, note: deps.nota } }),
  component: SessionRoute,
})

function SessionRoute() {
  const { feito, erro } = Route.useSearch()
  return (
    <SessionScreen page={Route.useLoaderData()} notice={feito} refusal={erro} />
  )
}
