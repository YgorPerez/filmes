import { createServerFn } from '@tanstack/react-start'
import { consultSql } from './operations-form'
import { ownerMiddleware, requireAdmin, requireOwner } from './owner'

/** What `/operacoes` shows (`operationsPage`), with the console's answer
 * when the query has `sql`. Only an admin: the page gate does not protect
 * a server function. */
export const readOperationsPage = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .validator((data: unknown) => ({
    sql: consultSql((data as { sql?: unknown } | undefined)?.sql),
  }))
  .handler(async ({ context, data }) => {
    requireAdmin(context.owner)
    const { appOperationsPage } = await import('#/platform/operations')
    return appOperationsPage(data.sql)
  })

/** The evaluation's progress, which the page reads again while it runs. */
export const readEvaluationPanel = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    requireAdmin(context.owner)
    const { appEvaluationPanel } = await import('#/platform/operations')
    return appEvaluationPanel()
  })

/** The push banner of the Dono pages: the status while pushes keep failing,
 * for an admin; null for anyone else. */
export const readPushAlert = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    requireOwner(context.owner)
    const { appPushAlert } = await import('#/platform/operations')
    return appPushAlert(context.owner)
  })
