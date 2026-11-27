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

/** Meu gosto's look at her taste (#274): the genres and directors of the
 * films she liked. Null when the engine cannot run. */
export const readTasteSummary = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .handler(async ({ context }) => {
    requireOwner(context.owner)
    const { appTasteSummary } = await import('#/platform/imports')
    return appTasteSummary(context.owner)
  })

/** Her Nota of each of some films (#274), so the rating screen says "sua
 * nota 9" on the film on the card and on the search's results. */
export const readMyRatings = createServerFn({ method: 'GET' })
  .middleware([ownerMiddleware])
  .validator((value: unknown) => {
    const films = (value ?? {}) as Record<string, unknown>
    if (
      !Array.isArray(films.ids) ||
      films.ids.length > 100 ||
      !films.ids.every((id) => typeof id === 'string' && /^tt\d+$/.test(id))
    )
      throw new Error('film ids required')
    return { ids: films.ids as string[] }
  })
  .handler(async ({ context, data }) => {
    requireOwner(context.owner)
    const { appRatingsOf } = await import('#/platform/imports')
    return appRatingsOf(data.ids, context.owner)
  })
