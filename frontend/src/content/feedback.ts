import { createServerFn } from '@tanstack/react-start'
import { correctionAttendees } from './feedback-form'
import { noteToken, ownerMiddleware, pathSlug, requireOwner } from './owner'

/** What a Sessão's Feedback form shows (`feedbackPage`). A request with
 * no Dono is refused: the page gate does not protect a server function. */
export const readFeedbackPage = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .validator(pathSlug)
  .handler(async ({ context, data }) => {
    requireOwner(context.owner)
    const { appFeedbackPage } = await import('#/platform/feedback')
    return appFeedbackPage(data, context.owner.person)
  })

/** A told Session's form, filled with what was told
 * (`feedbackCorrection`, #344). */
export const readFeedbackCorrection = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .validator((data: { session: string; attendees?: string[] }) => ({
    session: pathSlug(data.session),
    attendees: correctionAttendees(data.attendees),
  }))
  .handler(async ({ context, data }) => {
    requireOwner(context.owner)
    const { appFeedbackCorrection } = await import('#/platform/feedback')
    return appFeedbackCorrection(
      data.session,
      context.owner.person,
      data.attendees,
    )
  })

/** The reactions and comments the Catálogo search kept, in the note
 * `/sessoes/<sessao>/contar?nota=` names (`feedbackDraft`). */
const readFeedbackDraft = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .validator(noteToken)
  .handler(async ({ context, data }) => {
    requireOwner(context.owner)
    const { appFeedbackDraft } = await import('#/platform/feedback')
    return appFeedbackDraft(data)
  })

/** The draft for the page's loader: none without `?nota=`. */
export const feedbackDraftFor = (token: string | undefined) =>
  token === undefined
    ? Promise.resolve(null)
    : readFeedbackDraft({ data: token })

/** What `/sessoes/<sessao>/contar` shows once the correction (#344) is
 * read: its page in place of the open one, what was told under what the
 * search kept, and the film to mark. `correction` is null when not asked
 * for; `'unknown'` or null leaves the open page as it is. */
export function withCorrection<P, D>(
  opened: P,
  kept: D | null,
  correction: { page: P; film: string | null; draft: D } | 'unknown' | null,
  filme: string | undefined,
) {
  const fix = typeof correction === 'object' ? correction : null
  if (fix === null)
    return {
      page: opened,
      draft: kept,
      noted: kept !== null,
      correcting: false,
    }
  return {
    page: fix.page,
    // What the search kept wins over what was told.
    draft: kept ?? fix.draft,
    noted: kept !== null,
    correcting: true,
    // A film the search picked wins over the one told.
    film: filme ?? fix.film ?? undefined,
    nothing: filme === undefined && fix.film === null,
  }
}
