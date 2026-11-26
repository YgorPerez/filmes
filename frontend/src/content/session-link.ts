import { createServerFn } from '@tanstack/react-start'
import { setResponseHeaders } from '@tanstack/react-start/server'
import { sessionLinkHeaders, sessionLinkSearch } from './session-link-address'

export const readSessionLink = createServerFn({ method: 'GET' })
  .validator((value: unknown) =>
    sessionLinkSearch((value ?? {}) as Record<string, unknown>),
  )
  .handler(async ({ data }) => {
    setResponseHeaders(new Headers(sessionLinkHeaders))
    const { appSessionLink } = await import('#/platform/billboard')
    return appSessionLink(data)
  })
