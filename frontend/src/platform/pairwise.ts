// The Perguntas par a par [pairwise questions] on the web (#181). A
// Presente, through the Link da Sessão, answers "qual dos dois você gostou
// mais?" one pair at a time (`/participar/perguntas`, posting to
// `/participar/perguntas/enviar`); the answers wait in the Session. On the
// Session's page, the Dono records them as taste or discards them (posting
// to `/sessoes/<id>/perguntas`): gosto permanente only after her yes.
//
// Before the pairs, a Presente with few Notas picks the groups of films
// most like her (#415), posting to `/participar/perguntas/grupos`; the pick
// waits with her answers and the Dono decides on both at once.
//
// Every answer revalidates the link (`resolveSessionLink`) with what the
// request carries, and takes the Session and the Presente from it, never
// from the form. The engine checks the pair is one it asks next. The app's
// engine is wired in `billboard.ts`. Server only.

import {
  answerGroupPick,
  answerPairwise,
  decidePairwise,
  groupPickQuestion,
  MAX_GROUP_PICKS,
  pairwiseAnswers,
  pairwiseQuestions,
  type Engine,
  type ErrorOutput,
  type FilmRef,
  type GroupChoice,
  type Outcome,
  type WaitingAnswers,
} from '@filmes/engine'
import { pairwisePath } from '#/content/pairwise-address'
import {
  sessionLinkSearch,
  type SessionLinkSearch,
} from '#/content/session-link-address'
import { formPoster, seeOther } from './form-post'
import { cardsById, resolveSessionLink } from './session-link'
import { fromThisSite } from './same-site'

/** A film of a pair, with its cover (#275), or null without one. The
 * title stays the Catálogo's, the one the Dono reads the answers by. */
export type PairFilm = FilmRef & { poster: string | null }

/** A group of films to pick (#415), each film with its cover. */
export type PickGroup = Omit<GroupChoice, 'films'> & {
  films: ReadonlyArray<PairFilm>
}

/** What `/participar/perguntas` shows: how many she answered, of how many,
 * and the next pair (null once all are answered). `groups`, when she has
 * groups to pick first, with how many she may pick. */
export type PairwisePage = {
  answered: number
  total: number
  pair: readonly [PairFilm, PairFilm] | null
  groups?: { max: number; choices: ReadonlyArray<PickGroup> }
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
  const request = { session: link.session, person: link.selected.person }
  const [asked, picks] = await Promise.all([
    engine.run(pairwiseQuestions(request)),
    engine.run(groupPickQuestion(request)),
  ])
  if (asked.exitCode !== 0 || picks.exitCode !== 0) {
    if (asked.exitCode !== 0) logEngineError(asked)
    if (picks.exitCode !== 0) logEngineError(picks)
    return null
  }
  const { answered, pairs } = asked.output
  const total = answered + pairs.length
  const next = pairs[0]
  const groups = picks.output ?? []
  const byId = await cardsById(engine, [
    ...(next ?? []).map((film) => film.id),
    ...groups.flatMap((group) => group.films.map((film) => film.id)),
  ])
  const withCover = (film: FilmRef): PairFilm => {
    const card = byId.get(film.id)
    return { ...film, poster: card?.poster ?? null }
  }
  return {
    answered,
    total,
    pair: next ? [withCover(next[0]), withCover(next[1])] : null,
    ...(groups.length > 0 && {
      groups: {
        max: MAX_GROUP_PICKS,
        choices: groups.map((group) => ({
          ...group,
          films: group.films.map(withCover),
        })),
      },
    }),
  }
}

const field = (form: FormData, name: string) => {
  const value = form.get(name)
  return typeof value === 'string' ? value : undefined
}

/** A Presente's answer posted through the link: the form, the Session,
 * the Presente and the page to go back to; or the Response when it cannot
 * be taken (403 from elsewhere, `/participar` when the link no longer
 * opens). The Session and the Presente come from the link, never from the
 * form. */
async function linkAnswer(
  request: Request,
  engine: Engine,
  database: string,
  origin: string | undefined,
): Promise<
  Response | { form: FormData; session: string; person: string; back: string }
> {
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
  return { form, session: link.session, person, back }
}

/** Back to the page once the engine kept the answer; with `erro=1` when
 * it did not (logged unless the answer was refused). */
function answered(done: Outcome<unknown>, back: string): Response {
  if (done.exitCode === 0) return seeOther(back)
  if (done.output.error.code !== 'invalid_usage') logEngineError(done)
  return seeOther(`${back}&erro=1`)
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
  const post = await linkAnswer(request, engine, database, origin)
  if (post instanceof Response) return post
  const { form, session, person, back } = post
  const [a, b] = [field(form, 'a'), field(form, 'b')]
  const choice = field(form, 'escolha') || null
  if (!a || !b) return seeOther(`${back}&erro=1`)
  return answered(
    await engine.run(
      answerPairwise({ session, person, films: [a, b], choice }),
    ),
    back,
  )
}

/** `POST /participar/perguntas/grupos`: keeps the groups she picked
 * (`grupo`, 1 to `MAX_GROUP_PICKS`), or none with `acao=nenhum`, and goes
 * back to the page, which shows the pairs; `erro=1` when it was not kept.
 * A link that no longer opens goes to `/participar`. Only a form of this
 * site. */
export async function groupPickAction(
  request: Request,
  engine: Engine,
  database: string,
  origin: string | undefined,
): Promise<Response> {
  const post = await linkAnswer(request, engine, database, origin)
  if (post instanceof Response) return post
  const { form, session, person, back } = post
  const none = field(form, 'acao') === 'nenhum'
  const groups = none
    ? []
    : form.getAll('grupo').filter((g): g is string => typeof g === 'string')
  if (!none && groups.length === 0) return seeOther(`${back}&erro=1`)
  return answered(
    await engine.run(answerGroupPick({ session, person, groups })),
    back,
  )
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
