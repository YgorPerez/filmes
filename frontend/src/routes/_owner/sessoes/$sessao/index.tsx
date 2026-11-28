import { createFileRoute, notFound } from '@tanstack/react-router'
import {
  isNoteToken,
  isReplyRefusal,
  isSessionNotice,
} from '#/content/billboard-reply'
import { within } from '#/content/form-fields'
import { readRequestOptions, readSessionPage } from '#/content/sessions'
import { NotFound } from '#/ui/lost'
import { SessionAttendees } from '#/ui/session-attendees'
import { SessionScreen } from '#/ui/sessions'

const isAttendeeEditRefusal = within(['vazio', 'falha'] as const)

export const Route = createFileRoute('/_owner/sessoes/$sessao/')({
  validateSearch: (search) => ({
    feito: isSessionNotice(search.feito) ? search.feito : undefined,
    erro: isReplyRefusal(search.erro) ? search.erro : undefined,
    nota: isNoteToken(search.nota) ? search.nota : undefined,
    palavra: wordsParam(search.palavra),
    editar: search.editar === 'presentes' ? ('presentes' as const) : undefined,
    erroPresentes: isAttendeeEditRefusal(search.erroPresentes)
      ? search.erroPresentes
      : undefined,
  }),
  loaderDeps: ({ search }) => ({ nota: search.nota, editar: search.editar }),
  // A post loads the page again itself, once (`useFetchForm`). A Sessão
  // that does not exist is the 404 (status and page), not a page that
  // says so.
  loader: async ({ params, deps }) => {
    const page = await readSessionPage({
      data: { session: params.sessao, note: deps.nota },
    })
    if (page === 'unknown') throw notFound()
    const editing = deps.editar && page?.session.attendees.some((a) => a.owner)
    const options = editing ? await readRequestOptions() : null
    return { page, editing, people: options?.people ?? null }
  },
  component: SessionRoute,
  notFoundComponent: () => <NotFound what="session" />,
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
  const { feito, erro, palavra, erroPresentes } = Route.useSearch()
  const { page, editing, people } = Route.useLoaderData()
  if (page && editing)
    return (
      <SessionAttendees
        session={page.session}
        people={people}
        refusal={erroPresentes}
      />
    )
  return (
    <SessionScreen page={page} notice={feito} refusal={erro} words={palavra} />
  )
}
