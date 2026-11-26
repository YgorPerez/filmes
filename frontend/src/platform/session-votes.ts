// The group swipe on the Link da Sessão (#182). A Presente votes yes or no
// on each film of the screen; the deck's form posts the Votos to
// `/participar/votos`. A no is a Trocar from that Presente: the Session is
// redone with the films that stay (`recommendSession` with `keep`, from
// the request the current version asked). A yes can also redo the Session
// on its own by changing the order. Votos never touch taste. Server only.
//
// Every post revalidates the link first (`resolveSessionLink`, with a
// Presente chosen) and takes only a form of this site (`same-site.ts`). The Session is
// derived from the link, never from the form. Votos and the redo of one
// Session run one after another, so a redo always keeps the films of the
// screen that is current when it starts.

import {
  castVotes,
  readSession,
  recommendSession,
  sessionRedoRequest,
  votedBy,
  type Engine,
  type ErrorOutput,
} from '@filmes/engine'
import {
  sessionLinkPath,
  sessionLinkSearch,
} from '#/content/session-link-address'
import {
  votePath,
  type VoteNotice,
  type VoteRefusal,
} from '#/content/session-votes-address'
import { failureOf, seeOther } from './form-post'
import type { SessionFilm } from './session-fields'
import { resolveSessionLink } from './session-link'
import { fromThisSite } from './same-site'

/** What the deck shows the chosen Presente: the current version and the
 * films of its screen she has not voted on in the Session. */
export type VoteDeck = { version: number; films: SessionFilm[] }

export async function voteDeck(
  search: ReturnType<typeof sessionLinkSearch>,
  engine: Engine,
  database: string,
): Promise<VoteDeck | null> {
  const link = await resolveSessionLink(search, engine, database)
  if (!link?.selected) return null
  const read = await engine.run(readSession(link.session))
  if (read.exitCode !== 0) return null
  const voted = votedBy(read.output.frontmatter, link.selected.person)
  return {
    version: link.version,
    films: link.films.filter((film) => !voted.has(film.id)),
  }
}

/** One Session's Votos and redo at a time, in this process. */
const queues = new Map<string, Promise<unknown>>()

function oneAtATime<A>(session: string, task: () => Promise<A>): Promise<A> {
  const run = (queues.get(session) ?? Promise.resolve()).then(task, task)
  const settled = run.catch(() => undefined)
  queues.set(session, settled)
  void settled.then(() => {
    if (queues.get(session) === settled) queues.delete(session)
  })
  return run
}

function logEngineError({ output }: { output: ErrorOutput }): void {
  console.error(`engine: ${output.error.code}: ${output.error.message}`)
}

const filmsOf = (form: FormData, name: string) =>
  form.getAll(name).filter((v): v is string => typeof v === 'string')

/** `POST /participar/votos?sessao=…&chave=…&presente=…`: records the
 * chosen Presente's Votos, redoes the Session if a film left or the order
 * changed, and returns to the deck with what happened. */
export async function voteAction(
  request: Request,
  engine: Engine,
  database: string,
  origin: string | undefined,
): Promise<Response> {
  if (!fromThisSite(request, origin))
    return new Response('Origem recusada', { status: 403 })
  const search = sessionLinkSearch(
    Object.fromEntries(new URL(request.url).searchParams),
  )
  const back = () =>
    seeOther(
      search.sessao && search.chave
        ? sessionLinkPath(search.sessao, search.chave, search.presente)
        : '/participar',
    )
  const form = await request.formData()
  return oneAtATime(search.sessao ?? '', async () => {
    const link = await resolveSessionLink(search, engine, database)
    if (!link?.selected) return back()
    const deck = (outcome: { feito?: VoteNotice; erro?: VoteRefusal }) =>
      seeOther(votePath('votar', search, outcome))
    const votes = [
      ...filmsOf(form, 'sim').map((film) => ({ film, vote: 'yes' as const })),
      ...filmsOf(form, 'nao').map((film) => ({ film, vote: 'no' as const })),
    ]
    const cast = await engine.run(
      castVotes({
        session: link.session,
        person: link.selected.person,
        version: Number(form.get('versao')) || link.version,
        votes,
      }),
    )
    if (cast.exitCode !== 0) {
      logEngineError(cast)
      return deck({ erro: failureOf(cast) })
    }
    if (!cast.output.regenerate) return deck({ feito: 'votado' })
    const asked = await engine.run(sessionRedoRequest(link.session))
    if (asked.exitCode !== 0) {
      logEngineError(asked)
      return deck({ erro: 'regerar' })
    }
    const redone = await engine.run(
      recommendSession({ ...asked.output, keep: [cast.output.keep.join(',')] }),
    )
    if (redone.exitCode !== 0) {
      logEngineError(redone)
      return deck({ erro: 'regerar' })
    }
    return deck({
      feito: cast.output.dropped.length > 0 ? 'regerada' : 'atualizada',
    })
  })
}
