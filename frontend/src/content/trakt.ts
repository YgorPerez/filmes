import { createServerFn } from '@tanstack/react-start'
import { getRequest, setResponseHeader } from '@tanstack/react-start/server'
export const readTraktPage = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { traktPage } = await import('#/platform/trakt')
    setResponseHeader('Cache-Control', 'private, no-store')
    return traktPage(getRequest())
  },
)
