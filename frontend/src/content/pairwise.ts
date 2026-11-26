import { createServerFn } from '@tanstack/react-start'
import { setResponseHeaders } from '@tanstack/react-start/server'
import { sessionLinkHeaders, sessionLinkSearch } from './session-link-address'

// The Perguntas par a par's server function (#181).

/** The next pair for the chosen Presente (`pairwisePage`), or null. */
export const readPairwise = createServerFn({ method: 'GET' })
  .validator((value: unknown) =>
    sessionLinkSearch((value ?? {}) as Record<string, unknown>),
  )
  .handler(async ({ data }) => {
    setResponseHeaders(new Headers(sessionLinkHeaders))
    const { appPairwisePage } = await import('#/platform/billboard')
    return appPairwisePage(data)
  })
