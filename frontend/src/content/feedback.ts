import { createServerFn } from '@tanstack/react-start'
import { ownerMiddleware, pathSlug, requireOwner } from './owner'

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
