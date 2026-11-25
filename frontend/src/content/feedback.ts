import { createServerFn } from '@tanstack/react-start'
import { ownerMiddleware } from './owner'

/** What `/feedback` lists (`openSessionList`). A request with no Dono is
 * refused: the page gate does not protect a server function. */
export const readOpenSessions = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    if (!context.owner) throw new Error('Dono required')
    const { appOpenSessions } = await import('#/platform/feedback')
    return appOpenSessions()
  })

/** What `/feedback/<sessao>` shows (`feedbackPage`). */
export const readFeedbackPage = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .validator((session: string) => session)
  .handler(async ({ context, data }) => {
    if (!context.owner) throw new Error('Dono required')
    const { appFeedbackPage } = await import('#/platform/feedback')
    return appFeedbackPage(data)
  })
