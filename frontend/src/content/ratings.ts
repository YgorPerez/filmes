import { createServerFn } from '@tanstack/react-start'
import { ownerMiddleware, requireOwner } from './owner'

/** What the rating screen (`RATINGS_PATH`) shows: the logged-in Dono's Fila de Notas
 * (`ratingQueuePage`). A request with no Dono is refused: the page gate
 * does not protect a server function. */
export const readRatingQueue = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    requireOwner(context.owner)
    const { appRatingQueue } = await import('#/platform/imports')
    return appRatingQueue(context.owner)
  })

/** One film's card for the rating screen (#274): the poster, the synopsis,
 * the directors and the runtime, asked as the card comes up, so the page
 * opens without waiting for TMDB. Null when there is none. */
export const readFilmCard = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .validator((value: unknown) => {
    const film = (value ?? {}) as Record<string, unknown>
    if (typeof film.id !== 'string' || !/^tt\d+$/.test(film.id))
      throw new Error('film id required')
    return { id: film.id }
  })
  .handler(async ({ context, data }) => {
    requireOwner(context.owner)
    const { appFilmCard } = await import('#/platform/imports')
    return appFilmCard(data.id, context.owner)
  })
