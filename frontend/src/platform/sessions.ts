// Sessions (map #72, W1): every Session, the form that opens a new one
// (`recommendSession`, #94) with its Presentes, Regra, Climas and
// Restrições, and the page of one Session. The form posts to
// `/sessoes/nova/enviar`, which opens the Session as the logged-in Dono (the
// commit's author, and who "dono" is) and goes to its page. Server only.

import {
  readPeople,
  listSessions,
  readMoods,
  recommendSession,
  type Engine,
  type ErrorOutput,
  type Outcome,
  type SessionSummary,
} from '@filmes/engine'
import {
  parseSessionRequest,
  type SessionRequestForm,
  type SessionRequestRefusal,
} from '#/content/session-request'
import {
  appEngine,
  attendeeSlugs,
  sessionFilms,
  type SessionFilm,
} from './engine'
import { appPoster, formPoster, seeOther } from './form-post'
import { appNotes, type Notes } from './notes'

/** A Pessoa as the Sessions screens name her. `owner`: she is the Dono
 * looking (the logged-in Pessoa), or, with no one logged in, any Dono. */
export type SessionPerson = { person: string; name: string; owner: boolean }

/** A Session, as the list and its page show it. */
export type SessionItem = {
  id: string
  date: string
  request: string | null
  attendees: SessionPerson[]
  recommendation: SessionFilm[]
  open: boolean
  /** What the Feedback chose: the film, or null ("não vimos nada", or
   * still open). */
  chosen: { id: string; title: string } | null
  moods: string[]
  /** The Restrições' labels ("até 2h", "com criança de 7 anos"). */
  constraints: string[]
}

/** What the form offers: every Pessoa (the logged-in Dono first, and
 * checked) and the Climas. */
export type RequestOptions = { people: SessionPerson[]; moods: string[] }

/** What the screens and the form need from the engine. */
export interface Sessions {
  /** Every Session, the latest first. */
  list(): Promise<Outcome<SessionItem[]>>
  options(): Promise<Outcome<RequestOptions>>
  /** Opens a Session for the form's request, as the Dono `owner` (a
   * slug); gives its id and the Recomendação's warnings. */
  open(
    form: SessionRequestForm,
    owner: string,
  ): Promise<Outcome<{ id: string; warnings: string[] }>>
}

const ok = <A>(output: A): Outcome<A> => ({ exitCode: 0, output })

function item(
  s: SessionSummary,
  people: ReadonlyMap<string, SessionPerson>,
): SessionItem {
  const recommendation = sessionFilms(s.recommendation)
  return {
    id: s.id,
    date: s.date,
    request: typeof s.request === 'string' ? s.request : null,
    attendees: attendeeSlugs(s.attendees).map(
      (person) => people.get(person) ?? { person, name: person, owner: false },
    ),
    recommendation,
    open: s.open,
    chosen:
      s.chosen === null
        ? null
        : {
            id: s.chosen,
            title:
              recommendation.find((f) => f.id === s.chosen)?.title ?? s.chosen,
          },
    moods: [...s.moods],
    constraints: [...s.constraints],
  }
}

/** The Sessions as `viewer` (the logged-in Dono's slug) sees them: she is
 * the Dono among several (#131). */
export function sessionsFromEngine(
  engine: Engine,
  viewer: string | null = null,
): Sessions {
  const run = engine.run
  const people = async (): Promise<Outcome<SessionPerson[]>> => {
    const listed = await run(readPeople)
    if (listed.exitCode !== 0) return listed
    return ok(
      listed.output
        .map((p) => ({
          person: p.slug,
          name: p.name,
          owner: viewer === null ? p.owner : p.slug === viewer,
        }))
        .toSorted((a, b) => Number(b.owner) - Number(a.owner)),
    )
  }
  return {
    async list() {
      const listed = await run(listSessions)
      if (listed.exitCode !== 0) return listed
      const known = await people()
      if (known.exitCode !== 0) return known
      const byslug = new Map(known.output.map((p) => [p.person, p]))
      return ok(listed.output.sessions.map((s) => item(s, byslug)))
    },
    async options() {
      const known = await people()
      if (known.exitCode !== 0) return known
      const moods = await run(readMoods)
      if (moods.exitCode !== 0) return moods
      return ok({
        people: known.output,
        moods: moods.output.map((m) => m.name),
      })
    },
    async open(form, owner) {
      const opened = await run(recommendSession(form), { owner })
      return opened.exitCode === 0
        ? ok({
            id: opened.output.session.id,
            warnings: [...opened.output.warnings],
          })
        : opened
    },
  }
}

/** An engine error the Dono cannot fix from the page goes to the server log
 * (`docker logs`), so whoever runs the server sees why. */
function logEngineError(outcome: { output: ErrorOutput }): void {
  const { code, message } = outcome.output.error
  console.error(`engine: ${code}: ${message}`)
}

/** The outcome's value, or null (logged) when the engine failed. */
export function valueOf<A>(outcome: Outcome<A>): A | null {
  if (outcome.exitCode === 0) return outcome.output
  logEngineError(outcome)
  return null
}

/** What `/sessoes` lists; null when the engine cannot run here. */
export const sessionList = async (sessions: Sessions) =>
  valueOf(await sessions.list())

/** What `/sessoes/nova` offers; null when the engine cannot run here. */
export const requestOptions = async (sessions: Sessions) =>
  valueOf(await sessions.options())

/** What `/sessoes/<id>` shows: the Session, `'unknown'` when there is none
 * by that id, or null when the engine cannot run here. */
export async function sessionPage(
  id: string,
  sessions: Sessions,
): Promise<SessionItem | 'unknown' | null> {
  const list = await sessionList(sessions)
  if (list === null) return null
  return list.find((s) => s.id === id) ?? 'unknown'
}

/** Why the engine refused the request. The engine says which flag an
 * `invalid_usage` is about only in its message: a film outside the
 * Catálogo in `--parecido` is the one the page can name. */
function refusalOf(outcome: { output: ErrorOutput }): SessionRequestRefusal {
  const { code, message } = outcome.output.error
  switch (code) {
    case 'invalid_usage':
      return message.startsWith('--parecido') ? 'parecido' : 'pedido'
    case 'unknown_person':
    case 'ambiguous_person':
      return 'pessoa'
    default:
      logEngineError(outcome)
      return 'indisponivel'
  }
}

/** `POST /sessoes/nova/enviar`: opens the Session the form asks for as the
 * logged-in Dono and goes to its page (`?feito=aberta`, with `?nota=` for
 * the Recomendação's warnings), or back to the form saying why not
 * (`?erro=`). Only a Dono, and only a form of this site (the `Origin`): the
 * page gate does not cover this route. */
export async function sessionRequestAction(
  request: Request,
  owner: { readonly person: string } | null,
  sessions: Sessions,
  notes: Notes,
  origin: string | undefined,
): Promise<Response> {
  const poster = formPoster(request, owner, origin)
  if (poster instanceof Response) return poster
  const parsed = parseSessionRequest(await request.formData())
  if ('refused' in parsed)
    return seeOther(`/sessoes/nova?erro=${parsed.refused}`)
  const opened = await sessions.open(parsed.ok, poster.person)
  if (opened.exitCode !== 0)
    return seeOther(`/sessoes/nova?erro=${refusalOf(opened)}`)
  const { id, warnings } = opened.output
  const token = notes.remember({ warnings, addition: null })
  return seeOther(
    `/sessoes/${encodeURIComponent(id)}?feito=aberta${token ? `&nota=${token}` : ''}`,
  )
}

// --- the app's -----------------------------------------------------------------

const appSessions = (viewer: string | null = null) =>
  sessionsFromEngine(appEngine(), viewer)

/** Every Session for the app, as the logged-in Dono `viewer` sees them. */
export const appSessionList = (viewer: string) =>
  sessionList(appSessions(viewer))

/** The form's choices for the app, for the logged-in Dono `viewer`. */
export const appRequestOptions = (viewer: string) =>
  requestOptions(appSessions(viewer))

/** The form's route for the app: the logged-in Dono, the process's
 * engine. */
export const serveSessionRequest = (request: Request) => {
  const { owner, origin } = appPoster(request)
  return sessionRequestAction(request, owner, appSessions(), appNotes(), origin)
}
