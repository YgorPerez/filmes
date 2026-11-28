// Editing an open Session's request and Restrições on the web (#372, map
// #369): the page is the form filled with the current version
// (`sessionRequestEditDraft`), and saving redoes the Session with every
// film on the screen kept where it still passes (`editSessionRequest`).
// Only a Dono among the Presentes edits, and a told Session has no edit.
// Server only.

import {
  editSessionRequest,
  readMoods,
  sessionRequestEditDraft,
  type Engine,
  type ErrorOutput,
  type Outcome,
} from '@filmes/engine'
import {
  sessionEditPath,
  type SessionEditRefusal,
} from '#/content/session-edit'
import {
  parseSessionEdit,
  type SessionRequestEditForm,
} from '#/content/session-request'
import { appEngine } from './engine'
import { appPoster, failureOf, formPoster, seeOther } from './form-post'
import { appNotes, type Notes } from './notes'

/** What the edit page shows: the form's fields and the Climas to choose
 * from; or why there is no form. */
export type SessionEditPage =
  | {
      readonly id: string
      readonly fields: SessionRequestEditForm
      readonly moods: readonly string[]
    }
  | 'unknown'
  | 'closed'
  | 'absent'

/** What the edit needs from the engine. */
export interface SessionEdits {
  /** The current request and the Presentes of open Session `id`. */
  draft(
    id: string,
  ): Promise<
    Outcome<SessionRequestEditForm & { readonly attendees: readonly string[] }>
  >
  moods(): Promise<Outcome<readonly string[]>>
  /** Redoes Session `id` with `form`, as the Dono `owner` (a slug); gives
   * the Recomendação's warnings. */
  edit(
    id: string,
    form: SessionRequestEditForm,
    owner: string,
  ): Promise<Outcome<{ warnings: string[] }>>
}

export function sessionEditsFromEngine(engine: Engine): SessionEdits {
  const run = engine.run
  return {
    draft: async (id) => {
      const read = await run(sessionRequestEditDraft(id))
      if (read.exitCode !== 0) return read
      const { attendees, ...fields } = read.output
      return {
        exitCode: 0,
        output: {
          ...(fields as SessionRequestEditForm),
          attendees: [...attendees],
        },
      }
    },
    moods: async () => {
      const read = await run(readMoods)
      return read.exitCode === 0
        ? { exitCode: 0, output: read.output.map((m) => m.name) }
        : read
    },
    edit: async (id, form, owner) => {
      const done = await run(editSessionRequest(id, form), { owner })
      return done.exitCode === 0
        ? { exitCode: 0, output: { warnings: [...done.output.warnings] } }
        : done
    },
  }
}

function logEngineError(outcome: { output: ErrorOutput }): void {
  const { code, message } = outcome.output.error
  console.error(`engine: ${code}: ${message}`)
}

/** The edit page of Session `id` as `viewer` (the logged-in Dono's slug)
 * sees it; null when the engine cannot run here. */
export async function sessionEditPage(
  id: string,
  viewer: string,
  edits: SessionEdits,
): Promise<SessionEditPage | null> {
  const draft = await edits.draft(id)
  if (draft.exitCode !== 0) {
    const { code } = draft.output.error
    if (code === 'unknown_session') return 'unknown'
    if (code === 'closed_session') return 'closed'
    logEngineError(draft)
    return null
  }
  const { attendees, ...fields } = draft.output
  if (!attendees.includes(viewer)) return 'absent'
  const moods = await edits.moods()
  if (moods.exitCode !== 0) {
    logEngineError(moods)
    return null
  }
  return { id, fields, moods: moods.output }
}

/** Why the engine refused the edit. */
function refusalOf(outcome: { output: ErrorOutput }): SessionEditRefusal {
  const { code, message } = outcome.output.error
  switch (code) {
    case 'closed_session':
      return 'fechada'
    case 'invalid_usage':
      return message.startsWith('--parecido') ? 'parecido' : 'pedido'
    default:
      logEngineError(outcome)
      return failureOf(outcome)
  }
}

/** `POST /sessoes/<id>/pedido/enviar`: redoes Session `id` with the form
 * as its request, as the logged-in Dono, and goes to its page
 * (`?feito=regerada`, with `?nota=` for the warnings); or back to the
 * form saying why not (`?erro=`). Only a Dono among the Presentes, and
 * only a form of this site (the `Origin`). */
export async function sessionEditAction(
  request: Request,
  id: string,
  owner: { readonly person: string } | null,
  edits: SessionEdits,
  notes: Notes,
  origin: string | undefined,
): Promise<Response> {
  const poster = formPoster(request, owner, origin)
  if (poster instanceof Response) return poster
  const back = (why: SessionEditRefusal) =>
    seeOther(`${sessionEditPath(id)}?erro=${why}`)
  const parsed = parseSessionEdit(await request.formData())
  if ('refused' in parsed) return back(parsed.refused)
  const draft = await edits.draft(id)
  if (draft.exitCode !== 0) return back(refusalOf(draft))
  if (!draft.output.attendees.includes(poster.person)) return back('ausente')
  const done = await edits.edit(id, parsed.ok, poster.person)
  if (done.exitCode !== 0) return back(refusalOf(done))
  const token = notes.remember({
    warnings: done.output.warnings,
    addition: null,
  })
  return seeOther(
    `/sessoes/${encodeURIComponent(id)}?feito=regerada${token ? `&nota=${token}` : ''}`,
  )
}

// --- the app's -----------------------------------------------------------------

const appEdits = () => sessionEditsFromEngine(appEngine())

/** The edit page for the app. */
export const appSessionEditPage = (id: string, viewer: string) =>
  sessionEditPage(id, viewer, appEdits())

/** The edit form's route for the app. */
export const serveSessionEdit = (request: Request, id: string) => {
  const { owner, origin } = appPoster(request)
  return sessionEditAction(request, id, owner, appEdits(), appNotes(), origin)
}
