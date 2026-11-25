// Feedback (map #72, W3): the open Sessions, the form that records what the
// Presentes saw and thought (`recordFeedback`, #96), and the Crédito it
// changes. The form posts to `/feedback/<sessao>/enviar`, which records it
// as the logged-in Dono (the commit's author, and whose reactions are not
// relayed) and goes back to the list. Server only.

import {
  creditNow,
  listPeople,
  openSessions,
  recordFeedback,
  type CreditNow,
  type Engine,
  type ErrorOutput,
  type FeedbackResult,
  type Outcome,
} from '@filmes/engine'
import {
  parseFeedback,
  type FeedbackForm,
  type FeedbackRefusal,
} from '#/content/feedback-form'
import { currentOwner } from './auth'
import { formPoster, seeOther } from './form-post'
import { appEngine } from './engine'
import type { Owner } from './owners'
import { serverEnv } from './server-env'

/** A Presente of the Session, with her name and whether she is Dono (the
 * Dono speaks for herself with a Nota; a Relato is for the others). */
export type FeedbackAttendee = { person: string; name: string; owner: boolean }

/** A film of the Session's current Recomendação. */
export type FeedbackFilm = { position: number; id: string; title: string }

/** An open Session, as the list and the form show it. */
export type FeedbackSession = {
  id: string
  date: string
  request: string | null
  attendees: FeedbackAttendee[]
  recommendation: FeedbackFilm[]
}

/** A Presente's Crédito now: what the next Recomendação of this group
 * uses. */
export type FeedbackCredit = CreditNow & { name: string }

/** What `/feedback/<sessao>` shows. */
export type FeedbackPage = FeedbackSession & { credit: FeedbackCredit[] }

/** What the screens and the form need from the engine. */
export interface Feedback {
  /** The open Sessions, the latest first. */
  sessions(): Promise<Outcome<FeedbackSession[]>>
  credit(attendees: readonly string[]): Promise<Outcome<readonly CreditNow[]>>
  /** Records the Feedback and closes the Session, as the Dono `owner`
   * (a slug). */
  record(
    session: string,
    form: FeedbackForm,
    owner: string,
  ): Promise<Outcome<FeedbackResult>>
}

const ok = <A>(output: A): Outcome<A> => ({ exitCode: 0, output })

type Item = { position?: unknown; id?: unknown; title?: unknown }

const films = (recommendation: unknown): FeedbackFilm[] =>
  (Array.isArray(recommendation) ? (recommendation as Item[]) : []).map(
    (item) => ({
      position: Number(item.position),
      id: String(item.id),
      title: typeof item.title === 'string' ? item.title : String(item.id),
    }),
  )

const slugs = (attendees: unknown): string[] =>
  Array.isArray(attendees) ? attendees.map(String) : []

/** The form's reactions as the engine's `PESSOA=VALOR` lists. */
function requestOf(session: string, form: FeedbackForm) {
  const ratings: string[] = []
  const reports: string[] = []
  const comments: string[] = []
  for (const reaction of form.reactions) {
    if (reaction.kind === 'rating')
      ratings.push(`${reaction.person}=${reaction.rating}`)
    else reports.push(`${reaction.person}=${reaction.level}`)
    if (reaction.comment !== undefined)
      comments.push(`${reaction.person}=${reaction.comment}`)
  }
  return { session, film: form.film, ratings, reports, comments }
}

export function feedbackFromEngine(engine: Engine): Feedback {
  const run = engine.run
  return {
    async sessions() {
      const open = await run(openSessions)
      if (open.exitCode !== 0) return open
      const people = await run(listPeople)
      if (people.exitCode !== 0) return people
      const byslug = new Map(people.output.map((p) => [p.slug, p]))
      return ok(
        open.output.sessions.map((s) => ({
          id: s.id,
          date: s.date,
          request: typeof s.request === 'string' ? s.request : null,
          attendees: slugs(s.attendees).map((person) => ({
            person,
            name: byslug.get(person)?.name ?? person,
            owner: byslug.get(person)?.owner ?? false,
          })),
          recommendation: films(s.recommendation),
        })),
      )
    },
    credit: (attendees) => run(creditNow(attendees)),
    record: (session, form, owner) =>
      run(recordFeedback(requestOf(session, form)), { owner }),
  }
}

/** An engine error the Dono cannot fix from the page goes to the server log
 * (`docker logs`), so whoever runs the server sees why. */
function logEngineError(outcome: { output: ErrorOutput }): void {
  const { code, message } = outcome.output.error
  console.error(`engine: ${code}: ${message}`)
}

/** What `/feedback` lists; null when the engine cannot run here. */
export async function openSessionList(
  feedback: Feedback,
): Promise<FeedbackSession[] | null> {
  const list = await feedback.sessions()
  if (list.exitCode !== 0) {
    logEngineError(list)
    return null
  }
  return list.output
}

/** What `/feedback/<sessao>` shows: the open Session with its Presentes'
 * Crédito, `'unknown'` when no open Session has that id (it has its
 * Feedback already, or never was), or null when the engine cannot run
 * here. */
export async function feedbackPage(
  id: string,
  feedback: Feedback,
): Promise<FeedbackPage | 'unknown' | null> {
  const list = await openSessionList(feedback)
  if (list === null) return null
  const session = list.find((s) => s.id === id)
  if (!session) return 'unknown'
  const credit = await feedback.credit(session.attendees.map((a) => a.person))
  if (credit.exitCode !== 0) {
    logEngineError(credit)
    return null
  }
  const names = new Map(session.attendees.map((a) => [a.person, a.name]))
  return {
    ...session,
    credit: credit.output.map((c) => ({
      ...c,
      name: names.get(c.person) ?? c.person,
    })),
  }
}

/** Why the engine refused the Feedback. */
function refusalOf(outcome: { output: ErrorOutput }): FeedbackRefusal {
  switch (outcome.output.error.code) {
    case 'closed_session':
      return 'fechada'
    case 'unknown_film':
      return 'desconhecido'
    case 'ambiguous_film':
      return 'ambiguo'
    case 'invalid_usage':
    case 'unknown_person':
      return 'pedido'
    default:
      logEngineError(outcome)
      return 'indisponivel'
  }
}

const pageOf = (session: string) => `/feedback/${encodeURIComponent(session)}`

/** `POST /feedback/<sessao>/enviar`: records the form's Feedback as the
 * logged-in Dono and goes back to the list (`?feito=<sessao>`), or to the
 * form saying why not (`?erro=`). Only a Dono, and only a form of this site
 * (the `Origin`, as the logout checks): the page gate does not cover this
 * route. */
export async function feedbackAction(
  request: Request,
  session: string,
  owner: Owner | null,
  feedback: Feedback,
  origin: string | undefined,
): Promise<Response> {
  const poster = formPoster(request, owner, origin)
  if (poster instanceof Response) return poster
  const parsed = parseFeedback(await request.formData())
  if ('refused' in parsed)
    return seeOther(`${pageOf(session)}?erro=${parsed.refused}`)
  const outcome = await feedback.record(session, parsed.ok, poster.person)
  if (outcome.exitCode !== 0) {
    if (outcome.output.error.code === 'unknown_session')
      return seeOther('/feedback?erro=sessao')
    return seeOther(`${pageOf(session)}?erro=${refusalOf(outcome)}`)
  }
  return seeOther(`/feedback?feito=${encodeURIComponent(session)}`)
}

// --- the app's -----------------------------------------------------------------

const appFeedback = () => feedbackFromEngine(appEngine())

/** The open Sessions for the app. */
export const appOpenSessions = () => openSessionList(appFeedback())

/** A Session's Feedback form for the app. */
export const appFeedbackPage = (id: string) => feedbackPage(id, appFeedback())

/** The form's route for the app: the logged-in Dono, the process's
 * engine. */
export const serveFeedbackAction = (request: Request, session: string) =>
  feedbackAction(
    request,
    session,
    currentOwner(request),
    appFeedback(),
    serverEnv().APP_ORIGIN,
  )
