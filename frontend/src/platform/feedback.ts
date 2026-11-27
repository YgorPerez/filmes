// Feedback (map #72, W3): the open Sessions, the form that records what the
// Presentes saw and thought (`recordFeedback`, #96), and the satisfaction
// it changes (#176). The form posts to `/feedback/<sessao>/enviar`, which records it
// as the logged-in Dono (the commit's author, and whose reactions are not
// relayed) and goes back to the Session. Server only.

import {
  readPeople,
  listSessions,
  recordedFeedback,
  recordFeedback,
  satisfactionNow,
  type PersonSatisfactionNow,
  type SatisfactionNow,
  type Engine,
  type ErrorOutput,
  type FeedbackResult,
  type Outcome,
  type ToldFeedback,
} from '@filmes/engine'
import {
  feedbackDraftOf,
  feedbackSearch,
  parseFeedback,
  type FeedbackDraft,
  type FeedbackForm,
  type FeedbackRefusal,
} from '#/content/feedback-form'
import { feedbackPath, sessionPath } from '#/content/session-paths'
import { appPoster, failureOf, formPoster, seeOther } from './form-post'
import { appEngine } from './engine'
import { appNotes, type Notes } from './notes'
import { attendeeSlugs, sessionFilms, type SessionFilm } from './session-fields'
import type { Owner } from './owners'

/** A Presente of the Session, with her name and whether she is the Dono
 * who records it, the logged-in one (she speaks for herself with a Nota; a
 * Relato is for the others). */
export type FeedbackAttendee = { person: string; name: string; owner: boolean }

/** A film of the Session's current Recomendação. */
export type FeedbackFilm = SessionFilm

/** An open Session, as the list and the form show it. */
export type FeedbackSession = {
  id: string
  date: string
  request: string | null
  attendees: FeedbackAttendee[]
  recommendation: FeedbackFilm[]
  moods: readonly string[]
  constraints: readonly string[]
  /** What the Dono added from the Cartaz, in order (#272). */
  additions: readonly string[]
  /** The stars each film got on the Cartaz, by IMDb id. */
  stars: Readonly<Record<string, number>>
  /** The films that left the shelf in a redo. */
  earlier: readonly { id: string; title: string }[]
}

/** A Presente's satisfaction now: what the next Recomendação of this group
 * weighs. */
export type FeedbackSatisfaction = PersonSatisfactionNow & { name: string }

/** What a Sessão's Feedback form shows. */
export type FeedbackPage = FeedbackSession & {
  satisfaction: FeedbackSatisfaction[]
}

/** A told Session's form, to correct it (#344): the page, and the film
 * and the reactions as they were told, to fill it with. `film` is the
 * chosen film's id, or null for "não vimos nada". */
export type FeedbackCorrection = {
  page: FeedbackPage
  film: string | null
  draft: FeedbackDraft
}

/** What the screens and the form need from the engine. */
export interface Feedback {
  /** The open Sessions, the latest first; with `told`, the told ones
   * too. */
  sessions(told?: boolean): Promise<Outcome<FeedbackSession[]>>
  /** What a told Session's Feedback says; null while it is open. */
  told(session: string): Promise<Outcome<ToldFeedback | null>>
  satisfaction(attendees: readonly string[]): Promise<Outcome<SatisfactionNow>>
  /** Records the Feedback and closes the Session, as the Dono `owner`
   * (a slug). */
  record(
    session: string,
    form: FeedbackForm,
    owner: string,
  ): Promise<Outcome<FeedbackResult>>
}

const ok = <A>(output: A): Outcome<A> => ({ exitCode: 0, output })

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
  return {
    session,
    film: form.film,
    ratings,
    reports,
    comments,
    ...(form.correct === true && { correct: true }),
  }
}

/** The Feedback as `viewer` (the logged-in Dono's slug) records it. */
export function feedbackFromEngine(
  engine: Engine,
  viewer: string | null = null,
): Feedback {
  const run = engine.run
  return {
    async sessions(told = false) {
      const open = await run(listSessions)
      if (open.exitCode !== 0) return open
      const people = await run(readPeople)
      if (people.exitCode !== 0) return people
      const byslug = new Map(people.output.map((p) => [p.slug, p]))
      return ok(
        open.output.sessions
          .filter((session) => told || session.open)
          .map((s) => ({
            id: s.id,
            date: s.date,
            request: typeof s.request === 'string' ? s.request : null,
            attendees: attendeeSlugs(s.attendees).map((person) => ({
              person,
              name: byslug.get(person)?.name ?? person,
              owner:
                viewer === null
                  ? (byslug.get(person)?.owner ?? false)
                  : person === viewer,
            })),
            recommendation: sessionFilms(s.recommendation),
            moods: s.moods,
            constraints: s.constraints,
            additions: s.additions,
            stars: s.stars,
            earlier: s.earlier,
          })),
      )
    },
    told: (session) => run(recordedFeedback(session)),
    satisfaction: (attendees) => run(satisfactionNow(attendees)),
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

/** The open Sessions; null when the engine cannot run here. */
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

/** What a Sessão's Feedback form (`feedbackPath`) shows: the open Session with its Presentes'
 * satisfaction, `'unknown'` when no open Session has that id (it has its
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
  return withSatisfaction(session, feedback)
}

/** The Session with its Presentes' satisfaction now; null when the engine
 * cannot run here. */
async function withSatisfaction(
  session: FeedbackSession,
  feedback: Feedback,
): Promise<FeedbackPage | null> {
  const satisfaction = await feedback.satisfaction(
    session.attendees.map((a) => a.person),
  )
  if (satisfaction.exitCode !== 0) {
    logEngineError(satisfaction)
    return null
  }
  const names = new Map(session.attendees.map((a) => [a.person, a.name]))
  return {
    ...session,
    satisfaction: satisfaction.output.people.map((c) => ({
      ...c,
      name: names.get(c.person) ?? c.person,
    })),
  }
}

/** The form's value of each engine Relato level. */
const REPORT_VALUES = {
  liked: 'gostou',
  neutral: 'neutro',
  disliked: 'nao-gostou',
} as const

/** What was told, as the form's fields hold it. */
function toldDraft(told: ToldFeedback): FeedbackDraft {
  return Object.fromEntries(
    told.reactions.map((r) => [
      r.person,
      {
        ...(r.rating !== null
          ? { reaction: `nota:${r.rating}` }
          : r.report !== null && {
              reaction: `relato:${REPORT_VALUES[r.report]}`,
            }),
        ...(r.comment !== null && { comment: r.comment }),
      },
    ]),
  )
}

/** A told Session's form, filled with what was told (#344): `'unknown'`
 * when no told Session has that id or the Dono looking was not among its
 * Presentes, null when the engine cannot run here. */
export async function feedbackCorrection(
  id: string,
  feedback: Feedback,
): Promise<FeedbackCorrection | 'unknown' | null> {
  const list = await feedback.sessions(true)
  if (list.exitCode !== 0) {
    logEngineError(list)
    return null
  }
  const session = list.output.find((s) => s.id === id)
  if (!session || !session.attendees.some((a) => a.owner)) return 'unknown'
  const told = await feedback.told(id)
  if (told.exitCode !== 0) {
    logEngineError(told)
    return null
  }
  if (told.output === null) return 'unknown'
  const page = await withSatisfaction(session, feedback)
  if (page === null) return null
  return { page, film: told.output.chosen, draft: toldDraft(told.output) }
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
      return failureOf(outcome)
  }
}

/** The Catálogo search: back to the form with the results (with nothing
 * typed, saying so) and, in a note (`?nota=`), the reactions and comments
 * as the Dono left them, which the URL does not carry. */
function searchCatalog(
  form: FormData,
  query: string,
  session: string,
  notes: Notes,
  again = '',
): Response {
  const draft = feedbackDraftOf(form)
  const token = notes.remember({
    warnings: [],
    addition: null,
    ...(Object.keys(draft).length > 0 && { feedback: draft }),
  })
  const params = new URLSearchParams(
    query ? { buscar: query } : { erro: 'filme' },
  )
  if (token) params.set('nota', token)
  return seeOther(`${feedbackPath(session)}?${params}${again}`)
}

/** `POST /feedback/<sessao>/enviar`: records the form's Feedback as the
 * logged-in Dono and goes to the Sessão (`?feito=contada`), or back to the
 * form saying why not (`?erro=`); a Sessão gone shows its page's own
 * notice. The Catálogo search (its button, or Enter in its field) records
 * nothing: `searchCatalog`. Only a Dono, and only a form of this site
 * (the `Origin`, as the logout checks): the page gate does not cover this
 * route. */
export async function feedbackAction(
  request: Request,
  session: string,
  owner: Owner | null,
  feedback: Feedback,
  notes: Notes,
  origin: string | undefined,
): Promise<Response> {
  const poster = formPoster(request, owner, origin)
  if (poster instanceof Response) return poster
  const form = await request.formData()
  // A correction goes back to the correction's form (#344).
  const again = form.get('corrigir') === 'sim' ? '&corrigir=sim' : ''
  const query = feedbackSearch(form)
  if (query !== undefined)
    return searchCatalog(form, query, session, notes, again)
  const parsed = parseFeedback(form)
  if ('refused' in parsed)
    return seeOther(`${feedbackPath(session)}?erro=${parsed.refused}${again}`)
  const outcome = await feedback.record(session, parsed.ok, poster.person)
  if (outcome.exitCode !== 0) {
    if (outcome.output.error.code === 'unknown_session')
      return seeOther(sessionPath(session))
    return seeOther(
      `${feedbackPath(session)}?erro=${refusalOf(outcome)}${again}`,
    )
  }
  const token = notes.remember({
    warnings: outcome.output.warnings ?? [],
    addition: null,
  })
  const done = parsed.ok.correct === true ? 'corrigida' : 'contada'
  const notice = token ? `feito=${done}&nota=${token}` : `feito=${done}`
  return seeOther(`${sessionPath(session)}?${notice}`)
}

/** The reactions and comments the note `token` holds; null when there are
 * none (gone after a restart, or a note of another form). */
export const feedbackDraft = (
  token: string | undefined,
  notes: Notes,
): FeedbackDraft | null => notes.recall(token)?.feedback ?? null

// --- the app's -----------------------------------------------------------------

const appFeedback = (viewer: string | null = null) =>
  feedbackFromEngine(appEngine(), viewer)

/** A Session's Feedback form for the app, for the logged-in Dono
 * `viewer`. */
export const appFeedbackPage = (id: string, viewer: string) =>
  feedbackPage(id, appFeedback(viewer))

/** The form's route for the app: the logged-in Dono, the process's
 * engine. */
export const serveFeedbackAction = (request: Request, session: string) => {
  const { owner, origin } = appPoster(request)
  return feedbackAction(
    request,
    session,
    owner,
    appFeedback(),
    appNotes(),
    origin,
  )
}

/** A told Session's form, filled with what was told, for the logged-in
 * Dono `viewer` (#344). */
export const appFeedbackCorrection = (id: string, viewer: string) =>
  feedbackCorrection(id, appFeedback(viewer))

/** The draft of `/sessoes/<sessao>/contar?nota=`, for the app. */
export const appFeedbackDraft = (token: string) =>
  feedbackDraft(token, appNotes())
