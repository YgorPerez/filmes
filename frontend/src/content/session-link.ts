import { createServerFn } from '@tanstack/react-start'
import { setResponseHeaders } from '@tanstack/react-start/server'
import { sessionLinkHeaders, sessionLinkSearch } from './session-link-address'
import { voteSearch } from './session-votes-address'

// The server functions of the Link da Sessão's public pages: the link
// itself (#180), the Perguntas par a par (#181) and the group swipe's deck
// (#182). Each answers with the link's headers.

const linkSearch = (value: unknown) =>
  sessionLinkSearch((value ?? {}) as Record<string, unknown>)

/** The link, revalidated (`resolveSessionLink`), or null; without it,
 * whether the link was issued for a Session that closed since. */
export const readSessionLink = createServerFn({ method: 'GET' })
  .validator(linkSearch)
  .handler(async ({ data }) => {
    setResponseHeaders(new Headers(sessionLinkHeaders))
    const { appSessionLink, appClosedSessionLink } =
      await import('#/platform/billboard')
    const link = await appSessionLink(data)
    return {
      link,
      closed: link === null ? await appClosedSessionLink(data) : null,
    }
  })

/** The next pair for the chosen Presente (`pairwisePage`), or null. */
export const readPairwise = createServerFn({ method: 'GET' })
  .validator(linkSearch)
  .handler(async ({ data }) => {
    setResponseHeaders(new Headers(sessionLinkHeaders))
    const { appPairwisePage } = await import('#/platform/billboard')
    return appPairwisePage(data)
  })

/** The deck's search: the link's, and the films her sim missed. */
const deckSearch = (value: unknown) => ({
  ...linkSearch(value),
  fora: voteSearch((value ?? {}) as Record<string, unknown>).fora,
})

/** The group swipe's deck for the chosen Presente (`voteDeck`), or null. */
export const readVoteDeck = createServerFn({ method: 'GET' })
  .validator(deckSearch)
  .handler(async ({ data }) => {
    setResponseHeaders(new Headers(sessionLinkHeaders))
    const { appVoteDeck } = await import('#/platform/billboard')
    return appVoteDeck(data)
  })
