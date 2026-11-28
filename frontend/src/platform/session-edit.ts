// Editing an open Session's request and Restrições on the web (#372, map
// #369): the page is the form filled with the current version
// (`sessionRequestEditDraft`), and saving redoes the Session with every
// film on the screen kept where it still passes (`editSessionRequest`).
// Only a Dono among the Presentes edits, and a told Session has no edit.
// The form's route is `sessionEditAction`, in `sessions.ts`.
// Server only.

import {
  editSessionRequest,
  readMoods,
  sessionRequestEditDraft,
  type Engine,
  type Mood,
  type Outcome,
} from '@filmes/engine'
import type { SessionRequestEditForm } from '#/content/session-request'
import { appEngine } from './engine'
import { logEngineError } from './engine-log'

/** The Climas as chips: every one, and the ones "Nada de" can turn away. */
export const moodChoices = (moods: ReadonlyArray<Mood>) => ({
  moods: moods.map((m) => m.name),
  noMoods: moods.filter((m) => m.popularity === null).map((m) => m.name),
})

/** What the edit page shows: the form's fields and the Climas to choose
 * from; or why there is no form. */
export type SessionEditPage =
  | {
      readonly id: string
      readonly fields: SessionRequestEditForm
      readonly moods: readonly string[]
      /** The Climas "Nada de" can turn away (#387). */
      readonly noMoods: readonly string[]
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
  /** The Climas as chips, and the ones "Nada de" can turn away. */
  moods(): Promise<Outcome<ReturnType<typeof moodChoices>>>
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
        ? { exitCode: 0, output: moodChoices(read.output) }
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
  return { id, fields, ...moods.output }
}

// --- the app's -----------------------------------------------------------------

export const appEdits = () => sessionEditsFromEngine(appEngine())

/** The edit page for the app. */
export const appSessionEditPage = (id: string, viewer: string) =>
  sessionEditPage(id, viewer, appEdits())
