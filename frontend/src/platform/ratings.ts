// The rating screen (#144): the Fila de Notas of the logged-in Dono, and
// "Pronto", which posts the browser's draft to `/notas/enviar` and writes
// its Notas to her file in one commit (`personRate`). Server only.

import {
  personRate,
  ratingQueue,
  type Engine,
  type ErrorOutput,
  type Outcome,
  type PersonRateResult,
  type RatingQueue,
} from '@filmes/engine'
import {
  parseRatings,
  type GivenRating,
  type RatingRefusal,
} from '#/content/rating-form'
import { formPoster, seeOther } from './form-post'

/** Films the page gets: more than a sitting rates, fewer than a slow page. */
const QUEUE_SIZE = 100

/** The logged-in Dono who rates: her Pessoa, and her name and e-mail for
 * the commit (an `Owner`). */
export type Rater = {
  readonly person: string
  readonly name: string
  readonly email: string
}

/** What the screen and Pronto need from the engine. */
export interface Ratings {
  queue(person: string): Promise<Outcome<RatingQueue>>
  /** Writes the Notas to the Dono `owner`, who signs the commit. */
  rate(
    ratings: readonly GivenRating[],
    owner: Rater,
  ): Promise<Outcome<PersonRateResult>>
}

export function ratingsFromEngine(engine: Engine): Ratings {
  return {
    queue: (person) =>
      engine.run(ratingQueue({ person, limit: QUEUE_SIZE }), { owner: person }),
    rate: (ratings, owner) =>
      engine.run(
        personRate({
          person: owner.person,
          ratings,
          author: { name: owner.name, email: owner.email },
        }),
        { owner: owner.person },
      ),
  }
}

/** An engine error the Dono cannot fix from the page goes to the server log
 * (`docker logs`), so whoever runs the server sees why. */
function logEngineError(outcome: { output: ErrorOutput }): void {
  const { code, message } = outcome.output.error
  console.error(`engine: ${code}: ${message}`)
}

/** What `/notas` shows the logged-in Dono: her Fila de Notas, or null when
 * the engine cannot run here. */
export async function ratingQueuePage(
  owner: Pick<Rater, 'person'>,
  ratings: Ratings,
): Promise<RatingQueue | null> {
  const queue = await ratings.queue(owner.person)
  if (queue.exitCode !== 0) {
    logEngineError(queue)
    return null
  }
  return queue.output
}

function refusalOf(outcome: { output: ErrorOutput }): RatingRefusal {
  const { code } = outcome.output.error
  if (code === 'unknown_target') return 'alvo'
  if (code === 'invalid_usage') return 'pedido'
  logEngineError(outcome)
  return 'indisponivel'
}

/** `POST /notas/enviar`: writes the form's Notas to the logged-in Dono, who
 * signs the commit, and goes back to the screen saying how many
 * (`?feito=`) or why not (`?erro=`). Only a Dono, and only a form of this
 * site: the page gate does not cover this route. */
export async function rateAction(
  request: Request,
  owner: Rater | null,
  ratings: Ratings,
  origin: string | undefined,
): Promise<Response> {
  const poster = formPoster(request, owner, origin)
  if (poster instanceof Response) return poster
  const given = parseRatings(await request.formData())
  if (given === null) return seeOther('/notas?erro=pedido')
  const outcome = await ratings.rate(given, poster)
  if (outcome.exitCode !== 0)
    return seeOther(`/notas?erro=${refusalOf(outcome)}`)
  return seeOther(`/notas?feito=${outcome.output.added}`)
}
