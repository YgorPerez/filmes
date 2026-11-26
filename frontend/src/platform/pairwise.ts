// The Perguntas par a par [pairwise questions] on the web (#181). A
// Presente, through the Link da Sessão, answers "qual dos dois você gostou
// mais?" one pair at a time (`/participar/perguntas`, posting to
// `/participar/perguntas/enviar`); the answers wait in the Session. On the
// Session's page, the Dono records them as taste or discards them (posting
// to `/sessoes/<id>/perguntas`): gosto permanente only after her yes.
//
// Every answer revalidates the link (`resolveSessionLink`) with what the
// request carries, and takes the Session and the Presente from it, never
// from the form. The engine checks the pair is one it asks next. The app's
// engine is wired in `billboard.ts`. Server only.

import {
  answerPairwise,
  decidePairwise,
  pairwiseAnswers,
  pairwiseQuestions,
  type Engine,
  type ErrorOutput,
  type FilmRef,
  type WaitingAnswers,
} from '@filmes/engine'
import { pairwisePath } from '#/content/pairwise-address'
import {
  sessionLinkSearch,
  type SessionLinkSearch,
} from '#/content/session-link-address'
import { formPoster, seeOther } from './form-post'
import { resolveSessionLink } from './session-link'
import { fromThisSite } from './same-site'

/** What `/participar/perguntas` shows: how many she answered, of how many,
 * and the next pair (null once all are answered). */
export type PairwisePage = {
  answered: number
  total: number
  pair: readonly [FilmRef, FilmRef] | null
}

function logEngineError({ output }: { output: ErrorOutput }): void {
  console.error(`engine: ${output.error.code}: ${output.error.message}`)
}

/** The page for the Presente the link chose, or null without one. */
export async function pairwisePage(
  search: SessionLinkSearch,
  engine: Engine,
  database: string,
): Promise<PairwisePage | null> {
  const link = await resolveSessionLink(search, engine, database)
  if (!link?.selected) return null
  const asked = await engine.run(
    pairwiseQuestions({ session: link.session, person: link.selected.person }),
  )
  if (asked.exitCode !== 0) {
    logEngineError(asked)
    return null
  }
  const { answered, pairs } = asked.output
  return { answered, total: answered + pairs.length, pair: pairs[0] ?? null }
}

const field = (form: FormData, name: string) => {
  const value = form.get(name)
  return typeof value === 'string' ? value : undefined
}

/** `POST /participar/perguntas/enviar`: keeps one answer and goes back to
 * the page, which shows the next pair; `erro=1` when it was not kept. A
 * link that no longer opens goes to `/participar`, which says so. Only a
 * form of this site. */
export async function pairwiseAnswerAction(
  request: Request,
  engine: Engine,
  database: string,
  origin: string | undefined,
): Promise<Response> {
  if (!fromThisSite(request, origin))
    return new Response('Origem recusada', { status: 403 })
  const form = await request.formData()
  const search = sessionLinkSearch({
    sessao: field(form, 'sessao'),
    chave: field(form, 'chave'),
    presente: field(form, 'presente'),
  })
  const link = await resolveSessionLink(search, engine, database)
  if (!link?.selected || !search.chave) return seeOther('/participar')
  const person = link.selected.person
  const back = pairwisePath(link.session, search.chave, person)
  const [a, b] = [field(form, 'a'), field(form, 'b')]
  const choice = field(form, 'escolha') || null
  if (!a || !b) return seeOther(`${back}&erro=1`)
  const done = await engine.run(
    answerPairwise({ session: link.session, person, films: [a, b], choice }),
  )
  if (done.exitCode === 0) return seeOther(back)
  if (done.output.error.code !== 'invalid_usage') logEngineError(done)
  return seeOther(`${back}&erro=1`)
}

/** The answers that wait for the Dono, by Presente; none when the engine
 * could not read them (the reason is in the log). */
export async function pairwiseWaiting(
  session: string,
  engine: Engine,
): Promise<ReadonlyArray<WaitingAnswers>> {
  const read = await engine.run(pairwiseAnswers(session))
  if (read.exitCode === 0) return read.output
  logEngineError(read)
  return []
}

const DECISIONS = { gravar: true, descartar: false } as const

/** `POST /sessoes/<id>/perguntas`: the Dono records (`decisao=gravar`) or
 * discards a Presente's waiting answers; back to the Session's page with
 * what happened. Only a Dono, and only a form of this site. */
export async function pairwiseDecisionAction(
  request: Request,
  owner: { readonly person: string } | null,
  session: string,
  engine: Engine,
  origin: string | undefined,
): Promise<Response> {
  const poster = formPoster(request, owner, origin)
  if (poster instanceof Response) return poster
  const page = `/sessoes/${encodeURIComponent(session)}`
  const form = await request.formData()
  const person = field(form, 'presente')
  const decision = field(form, 'decisao')
  if (!person || (decision !== 'gravar' && decision !== 'descartar'))
    return seeOther(`${page}?erro=indisponivel`)
  const record = DECISIONS[decision]
  const done = await engine.run(decidePairwise({ session, person, record }), {
    owner: poster.person,
  })
  if (done.exitCode !== 0) {
    logEngineError(done)
    return seeOther(`${page}?erro=indisponivel`)
  }
  return seeOther(
    `${page}?feito=${record ? 'perguntas-gravadas' : 'perguntas-descartadas'}`,
  )
}
