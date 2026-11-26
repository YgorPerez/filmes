// The Cartaz [billboard] on the web (#114): a Session's page shows the
// engine's `billboardModel`, and the Cartaz's Enviar posts its text to
// `/sessoes/<id>/responder`. There the reply is recorded as the logged-in
// Dono (`answerBillboard`); when a film left the screen (Já vi, Trocar),
// acrescentar came or the Dono chose other Climas, the Recomendação is
// redone with the films that stay (`recommendSession` with `keep`, from the
// request the current version asked, `sessionRedoRequest`, and the Climas
// the reply chose). The page then shows the new version: the
// kept films at their number, the new ones "novo", and "Saiu" with why.
//
// The acrescentar is read by the Leitura do pedido (#200) and what it
// understood goes into the redo request (the engine's `ADDITION_FIELDS` and
// `withAddition`): Presentes and Climas added, a Restrição added or
// replacing the same one, a Parecido replacing the one there; how many
// films, the Regra and "de" are not read from it. An acrescentar with
// nothing understood redoes nothing by itself.
// It is never read for taste: gosto permanente is written only after the
// Dono's yes, and on the web that yes is hers on the Pessoa's page. The
// page says so. Server only.

import {
  ADDITION_FIELDS,
  answerBillboard,
  billboard,
  readRequest,
  recommendSession,
  sessionRedoRequest,
  withAddition,
  type Billboard,
  type Engine,
  type WaitingAnswers,
  type ErrorOutput,
  type Outcome,
} from '@filmes/engine'
import type { ReplyRefusal, SessionNotice } from '#/content/billboard-reply'
import type { SessionLinkSearch } from '#/content/session-link-address'
import { appEngine } from './engine'
import { appPoster, failureOf, formPoster, seeOther } from './form-post'
import { appNotes, type Note, type Notes } from './notes'
import {
  pairwiseAnswerAction,
  pairwiseDecisionAction,
  pairwisePage,
  pairwiseWaiting,
} from './pairwise'
import { pageReading, type PageReading } from './reading'
import { serverEnv } from './server-env'
import { issueSessionLink, resolveSessionLink } from './session-link'
import { voteAction, voteDeck } from './session-votes'
import { sessionPage, sessionsFromEngine, type Sessions } from './sessions'
import type { SessionItem } from './sessions'

/** What a reply did: redone or only noted, and what to tell the Dono. */
export type ReplyDone = { regenerated: boolean; note: Note }

/** What the Cartaz needs from the engine. */
export interface Billboards {
  /** The Cartaz of the Session and the sources' warnings. */
  model(id: string): Promise<Outcome<{ model: Billboard; warnings: string[] }>>
  /** Records the reply as the Dono `owner` (a slug) and, if it asks,
   * redoes the Recomendação. `stage` says which step failed. */
  answer(
    id: string,
    text: string,
    owner: string,
  ): Promise<Outcome<ReplyDone> & { stage?: 'answer' | 'redo' }>
}

/** The Cartaz as `viewer` (the logged-in Dono's slug) sees it: she is
 * "Você". */
export function billboardsFromEngine(
  engine: Engine,
  viewer: string | null = null,
): Billboards {
  const run = engine.run
  return {
    async model(id) {
      const made = await run(
        billboard({ session: id }),
        viewer === null ? {} : { owner: viewer },
      )
      if (made.exitCode !== 0) return made
      return {
        exitCode: 0,
        output: {
          model: made.output.billboard,
          warnings: [...made.output.warnings],
        },
      }
    },
    async answer(id, text, owner) {
      const reply = await run(answerBillboard({ session: id, text }), {
        owner,
      })
      if (reply.exitCode !== 0) return { ...reply, stage: 'answer' }
      const { keep, moods, dropped, warnings, addition } = reply.output
      const read =
        addition === null
          ? null
          : await run(
              readRequest({ text: addition, fields: ADDITION_FIELDS }),
              {
                owner,
              },
            )
      if (read !== null && read.exitCode !== 0) logEngineError(read)
      const reading = read?.exitCode === 0 ? read.output : null
      const note = (more: readonly string[] = []): Note => ({
        warnings: [...warnings, ...more],
        addition,
        ...(reading && { reading: pageReading(reading) }),
      })
      // The web decides here, by the Leitura do pedido (#184, 2026-11-26):
      // an acrescentar with nothing understood and no film dropped does not
      // redo. The MCP keeps `answerBillboard`'s own `regenerate`, since
      // there Claude reads the acrescentar.
      const regenerate =
        dropped.length > 0 ||
        moods !== null ||
        (reading?.understood.length ?? 0) > 0
      if (!regenerate)
        return { exitCode: 0, output: { regenerated: false, note: note() } }
      const asked = await run(sessionRedoRequest(id))
      if (asked.exitCode !== 0) return { ...asked, stage: 'redo' }
      const chosen = {
        ...asked.output,
        ...(moods !== null && { moods: [...moods] }),
      }
      const redone = await run(
        recommendSession({
          ...(reading ? withAddition(chosen, reading.request) : chosen),
          keep: [keep.join(',')],
        }),
        { owner },
      )
      if (redone.exitCode !== 0) return { ...redone, stage: 'redo' }
      return {
        exitCode: 0,
        output: { regenerated: true, note: note(redone.output.warnings) },
      }
    },
  }
}

/** An engine error the Dono cannot fix from the page goes to the server
 * log (`docker logs`). */
function logEngineError(outcome: { output: ErrorOutput }): void {
  const { code, message } = outcome.output.error
  console.error(`engine: ${code}: ${message}`)
}

/** What `/sessoes/<id>` shows: the Session, its Cartaz (null when the
 * engine could not make it: the reason is in the log), and what the last
 * reply or the form had to say. */
export type CartazPage = {
  session: SessionItem
  billboard: Billboard | null
  warnings: string[]
  addition: string | null
  /** What the reading made of the acrescentar (#200). */
  reading?: PageReading
  sessionLink?: string | null
  /** The Presentes' Perguntas par a par that wait for the Dono (#181). */
  pairwise?: ReadonlyArray<WaitingAnswers>
}

export async function cartazPage(
  id: string,
  note: string | undefined,
  sessions: Sessions,
  billboards: Billboards,
  notes: Notes,
): Promise<CartazPage | 'unknown' | null> {
  const session = await sessionPage(id, sessions)
  if (session === null || session === 'unknown') return session
  const made = await billboards.model(id)
  if (made.exitCode !== 0) logEngineError(made)
  const recalled = notes.recall(note)
  const warnings = [
    ...(recalled?.warnings ?? []),
    ...(made.exitCode === 0 ? made.output.warnings : []),
  ]
  return {
    session,
    billboard: made.exitCode === 0 ? made.output.model : null,
    warnings: [...new Set(warnings)],
    addition: recalled?.addition ?? null,
    ...(recalled?.reading && { reading: recalled.reading }),
  }
}

/** Why the reply was refused. */
function refusalOf(
  outcome: { output: ErrorOutput },
  stage: 'answer' | 'redo' | undefined,
): ReplyRefusal {
  const { code } = outcome.output.error
  if (stage === 'answer' && code === 'invalid_usage') return 'texto'
  if (code === 'closed_session') return 'fechada'
  logEngineError(outcome)
  return stage === 'redo' ? 'regerar' : failureOf(outcome)
}

/** `POST /sessoes/<id>/responder`: records the Cartaz's text and, when it
 * asks, redoes the Recomendação; back to the Session's page with what
 * happened (`?feito=`, `?nota=`) or why not (`?erro=`). Only a Dono, and
 * only a form of this site. */
export async function replyAction(
  request: Request,
  owner: { readonly person: string } | null,
  id: string,
  billboards: Billboards,
  notes: Notes,
  origin: string | undefined,
): Promise<Response> {
  const poster = formPoster(request, owner, origin)
  if (poster instanceof Response) return poster
  const page = `/sessoes/${encodeURIComponent(id)}`
  const text = (await request.formData()).get('texto')
  // Only the header: nothing was marked.
  if (typeof text !== 'string' || !text.trim().includes('\n'))
    return seeOther(`${page}?erro=nada`)
  // A form sends its line breaks as CRLF.
  const done = await billboards.answer(
    id,
    text.replaceAll('\r\n', '\n'),
    poster.person,
  )
  if (done.exitCode !== 0)
    return seeOther(`${page}?erro=${refusalOf(done, done.stage)}`)
  const feito: SessionNotice = done.output.regenerated ? 'regerada' : 'anotada'
  const token = notes.remember(done.output.note)
  return seeOther(`${page}?feito=${feito}${token ? `&nota=${token}` : ''}`)
}

// --- the app's -----------------------------------------------------------------

const appBillboards = () => billboardsFromEngine(appEngine())

/** One Session's page for the app, as the logged-in Dono `viewer` sees
 * it. */
export async function appCartazPage(
  id: string,
  note: string | undefined,
  viewer: string,
): Promise<CartazPage | 'unknown' | null> {
  const engine = appEngine()
  const made = await cartazPage(
    id,
    note,
    sessionsFromEngine(engine, viewer),
    billboardsFromEngine(engine, viewer),
    appNotes(),
  )
  if (!made || made === 'unknown') return made
  const page = { ...made, pairwise: await pairwiseWaiting(id, engine) }
  if (!page.session.open) return page
  const { APP_ORIGIN, AUTH_DATABASE_PATH } = serverEnv()
  return {
    ...page,
    sessionLink: await issueSessionLink(
      id,
      viewer,
      engine,
      AUTH_DATABASE_PATH,
      APP_ORIGIN,
    ),
  }
}

/** The public page of a Link da Sessão, for the app. */
export const appSessionLink = (search: SessionLinkSearch) =>
  resolveSessionLink(search, appEngine(), serverEnv().AUTH_DATABASE_PATH)

/** The group swipe's deck (#182), for the app. */
export const appVoteDeck = (search: SessionLinkSearch) =>
  voteDeck(search, appEngine(), serverEnv().AUTH_DATABASE_PATH)

/** The group swipe's post (#182), for the app. */
export const serveVotes = (request: Request) => {
  const { AUTH_DATABASE_PATH, APP_ORIGIN } = serverEnv()
  return voteAction(request, appEngine(), AUTH_DATABASE_PATH, APP_ORIGIN)
}

/** The reply's route for the app. */
export const serveReply = (request: Request, id: string) => {
  const { owner, origin } = appPoster(request)
  return replyAction(request, owner, id, appBillboards(), appNotes(), origin)
}

// --- the Perguntas par a par's (#181) ---------------------------------------

/** The Perguntas par a par page of a Link da Sessão, for the app. */
export const appPairwisePage = (search: SessionLinkSearch) =>
  pairwisePage(search, appEngine(), serverEnv().AUTH_DATABASE_PATH)

/** The route of a Presente's answer, for the app. */
export const servePairwiseAnswer = (request: Request) => {
  const { AUTH_DATABASE_PATH, APP_ORIGIN } = serverEnv()
  return pairwiseAnswerAction(
    request,
    appEngine(),
    AUTH_DATABASE_PATH,
    APP_ORIGIN,
  )
}

/** The route of the Dono's decision on the answers, for the app. */
export const servePairwiseDecision = (request: Request, id: string) => {
  const { owner, origin } = appPoster(request)
  return pairwiseDecisionAction(request, owner, id, appEngine(), origin)
}
