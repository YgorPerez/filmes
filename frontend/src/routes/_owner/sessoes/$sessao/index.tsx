import { createFileRoute } from '@tanstack/react-router'
import {
  isNoteToken,
  isReplyRefusal,
  isSessionNotice,
} from '#/content/billboard-reply'
import { readSessionPage } from '#/content/sessions'
import { SessionScreen } from '#/ui/sessions'

export const Route = createFileRoute('/_owner/sessoes/$sessao/')({
  validateSearch: (search) => ({
    feito: isSessionNotice(search.feito) ? search.feito : undefined,
    erro: isReplyRefusal(search.erro) ? search.erro : undefined,
    nota: isNoteToken(search.nota) ? search.nota : undefined,
    palavra: wordsParam(search.palavra),
  }),
  loaderDeps: ({ search }) => ({ nota: search.nota }),
  // A post loads the page again itself, once (`useFetchForm`).
  loader: ({ params, deps }) =>
    readSessionPage({ data: { session: params.sessao, note: deps.nota } }),
  component: SessionRoute,
})

/** The acrescentar's words the reading did not take (`?palavra=`, one
 * per run), short and few. */
function wordsParam(value: unknown): string[] | undefined {
  const all = (Array.isArray(value) ? value : [value]).filter(
    (word): word is string => typeof word === 'string' && word.length <= 200,
  )
  return all.length > 0 ? all.slice(0, 10) : undefined
}

function SessionRoute() {
  const { feito, erro, palavra } = Route.useSearch()
  return (
    <SessionScreen
      page={Route.useLoaderData()}
      notice={feito}
      refusal={erro}
      words={palavra}
    />
  )
}
