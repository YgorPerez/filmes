import { createServerFn } from '@tanstack/react-start'
import { setResponseHeaders } from '@tanstack/react-start/server'
import { sessionLinkHeaders, sessionLinkSearch } from './session-link-address'

/** The group swipe's deck for the chosen Presente (#182). */
export const readVoteDeck = createServerFn({ method: 'GET' })
  .validator((value: unknown) =>
    sessionLinkSearch((value ?? {}) as Record<string, unknown>),
  )
  .handler(async ({ data }) => {
    setResponseHeaders(new Headers(sessionLinkHeaders))
    const { appVoteDeck } = await import('#/platform/billboard')
    return appVoteDeck(data)
  })
