import { createServerFn } from '@tanstack/react-start'
import { isNoteToken } from './billboard-reply'
import { noteToken, ownerMiddleware, pathSlug, requireOwner } from './owner'

/** What `/sessoes` lists (`sessionList`). A request with no Dono is
 * refused: the page gate does not protect a server function. */
export const readSessions = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .validator((value: unknown) => value === true)
  .handler(async ({ context, data: pendingOnly }) => {
    requireOwner(context.owner)
    const { appSessionList } = await import('#/platform/sessions')
    return listedSessions(
      await appSessionList(context.owner.person),
      pendingOnly,
    )
  })

/** The Sessions `/sessoes` lists. "Para contar": the open ones, which
 * still wait for their Feedback. */
export const listedSessions = <S extends { open: boolean }>(
  sessions: S[] | null,
  pendingOnly: boolean,
): S[] | null =>
  pendingOnly ? (sessions?.filter((session) => session.open) ?? null) : sessions

/** A Session that was already told, among `sessions`: what they saw
 * (#272). Undefined when `id` is not one. */
export function toldSession(
  sessions:
    | readonly {
        id: string
        open: boolean
        chosen: { title: string } | null
        attendees: readonly { owner: boolean }[]
      }[]
    | null,
  id: string,
): { title: string | null; mine: boolean } | undefined {
  const told = sessions?.find((s) => s.id === id && !s.open)
  return (
    told && {
      title: told.chosen?.title ?? null,
      // The Dono looking was there: she may correct it (#344).
      mine: told.attendees.some((a) => a.owner),
    }
  )
}

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

/** Nova Sessão as "Ler" left it, in the note `/sessoes/nova?nota=` names
 * (`newSessionDraft`). */
const readNewSessionDraft = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .validator(noteToken)
  .handler(async ({ context, data }) => {
    requireOwner(context.owner)
    const { appNewSessionDraft } = await import('#/platform/sessions')
    return appNewSessionDraft(data)
  })

/** Nova Sessão as Sessão `id` was asked (`repeatDraft`): the home's
 * "Pedir de novo". */
const readRepeatDraft = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .validator(pathSlug)
  .handler(async ({ context, data }) => {
    requireOwner(context.owner)
    const { appRepeatDraft } = await import('#/platform/sessions')
    return appRepeatDraft(data, context.owner.person)
  })

/** The draft for a page's loader: the note of `?nota=`, else the Sessão
 * of `?repetir=`, else none. */
export const draftFor = (token: string | undefined, repeat?: string) =>
  token !== undefined
    ? readNewSessionDraft({ data: token })
    : repeat !== undefined
      ? readRepeatDraft({ data: repeat })
      : Promise.resolve(null)

/** What `/sessoes/<id>` shows (`cartazPage`): the Session, its Cartaz,
 * and the note `nota` names (warnings, the acrescentar). */
export const readSessionPage = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .validator(sessionPageInput)
  .handler(async ({ context, data }) => {
    requireOwner(context.owner)
    const { appCartazPage } = await import('#/platform/billboard')
    return appCartazPage(data.session, data.note, context.owner.person)
  })

/** `readSessionPage`'s input: the Session's slug and, when it is one, the
 * note's token. */
export function sessionPageInput(value: unknown) {
  const { session, note } = (value ?? {}) as Record<string, unknown>
  return {
    session: pathSlug(session),
    note: isNoteToken(note) ? note : undefined,
  }
}
