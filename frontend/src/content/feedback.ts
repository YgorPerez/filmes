import { createServerFn } from '@tanstack/react-start'
import { ownerMiddleware, pathSlug, requireOwner } from './owner'

/** What `/feedback` lists (`openSessionList`). A request with no Dono is
 * refused: the page gate does not protect a server function. */
export const readOpenSessions = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    requireOwner(context.owner)
    const { appOpenSessions } = await import('#/platform/feedback')
    return appOpenSessions()
  })

/** What `/feedback/<sessao>` shows (`feedbackPage`). */
export const readFeedbackPage = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .validator(pathSlug)
  .handler(async ({ context, data }) => {
    requireOwner(context.owner)
    const { appFeedbackPage } = await import('#/platform/feedback')
    return appFeedbackPage(data)
  })
