import { createServerFn } from '@tanstack/react-start'
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
