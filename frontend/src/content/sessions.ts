import { createServerFn } from '@tanstack/react-start'
import { isNoteToken } from './billboard-reply'
import { ownerMiddleware, pathSlug, requireOwner } from './owner'

/** What `/sessoes` lists (`sessionList`). A request with no Dono is
 * refused: the page gate does not protect a server function. */
export const readSessions = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    requireOwner(context.owner)
    const { appSessionList } = await import('#/platform/sessions')
    return appSessionList(context.owner.person)
  })

/** What the "Nova Sessão" form offers (`requestOptions`). */
export const readRequestOptions = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    requireOwner(context.owner)
    const { appRequestOptions } = await import('#/platform/sessions')
    return appRequestOptions(context.owner.person)
  })

/** What `/sessoes/<id>` shows (`cartazPage`): the Session, its Cartaz,
 * and the note `nota` names (warnings, the acrescentar). */
export const readSessionPage = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .validator((value: unknown) => {
    const { session, note } = (value ?? {}) as Record<string, unknown>
    return {
      session: pathSlug(session),
      note: isNoteToken(note) ? note : undefined,
    }
  })
  .handler(async ({ context, data }) => {
    requireOwner(context.owner)
    const { appCartazPage } = await import('#/platform/billboard')
    return appCartazPage(data.session, data.note, context.owner.person)
  })
