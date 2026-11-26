import { createServerFn } from '@tanstack/react-start'
import { isNoteToken } from './billboard-reply'
import { ownerMiddleware, pathSlug, requireOwner } from './owner'
import { sentenceParam } from './session-request'

/** What `/sessoes` lists (`sessionList`). A request with no Dono is
 * refused: the page gate does not protect a server function. */
export const readSessions = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    requireOwner(context.owner)
    const { appSessionList } = await import('#/platform/sessions')
    return appSessionList(context.owner.person)
  })

/** What `/` shows (`homeData`): the setup guide, the latest Sessão and the
 * MCP address. A request with no Dono is refused, as above. */
export const readHome = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    requireOwner(context.owner)
    const { appHome } = await import('#/platform/setup-guide')
    return appHome(context.owner)
  })

/** What the "Nova Sessão" form offers (`requestOptions`). */
export const readRequestOptions = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    requireOwner(context.owner)
    const { appRequestOptions } = await import('#/platform/sessions')
    return appRequestOptions(context.owner.person)
  })

/** The sentence of `/sessoes/nova?frase=` read into the form's fields
 * (`sentenceReading`), with "eu" as the logged-in Dono. */
const readSentence = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .validator((value: unknown) => {
    const text = sentenceParam(value)
    if (text === undefined) throw new Error('sentence required')
    return text
  })
  .handler(async ({ context, data }) => {
    requireOwner(context.owner)
    const { appSentenceReading } = await import('#/platform/sessions')
    return appSentenceReading(data, context.owner.person)
  })

/** The reading for a page's loader: none without `?frase=`. */
export const readingFor = (text: string | undefined) =>
  text === undefined ? Promise.resolve(null) : readSentence({ data: text })

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
