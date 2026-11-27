// The rating screen (#144): the Fila de Notas of the logged-in Dono, and
// "Pronto", which posts the browser's draft to `/notas/enviar` and writes
// its Notas to her file in one commit (`personRate`). Server only.

import {
  filmCard,
  personRate,
  personRatingsOf,
  ratingQueue,
  tasteSummary,
  type Engine,
  type FilmCard,
  type TasteSummary,
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
import { RATINGS_PATH } from '#/content/paths'
import { failureOf, formPoster, seeOther } from './form-post'

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
  /** What the card shows of one film, so she knows it (#274). */
  card(film: string, person: string): Promise<Outcome<FilmCard>>
  /** Meu gosto's look at her taste: her genres and directors (#274). */
  summary(person: string): Promise<Outcome<TasteSummary>>
  /** Her Nota of each of `films` that has one, 1 to 10 (#274). */
  ratingsOf(
    person: string,
    films: readonly string[],
  ): Promise<Outcome<Readonly<Record<string, number>>>>
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
    card: (film, person) => engine.run(filmCard({ film }), { owner: person }),
    summary: (person) =>
      engine.run(tasteSummary({ person }), { owner: person }),
    ratingsOf: (person, films) =>
      engine.run(personRatingsOf({ person, films }), { owner: person }),
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

/** What the rating screen (`RATINGS_PATH`) shows the logged-in Dono: her Fila de Notas, or null when
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

/** The film card of the rating screen, or null when the film is not in the
 * Catálogo or the engine cannot run (logged: the card does without it). */
export async function filmCardOf(
  film: string,
  owner: Pick<Rater, 'person'>,
  ratings: Ratings,
): Promise<FilmCard | null> {
  const card = await ratings.card(film, owner.person)
  if (card.exitCode !== 0) {
    logEngineError(card)
    return null
  }
  return card.output
}

/** The logged-in Dono's taste in one look, or null when the engine cannot
 * run (logged: the ficha does without it). */
export async function tasteSummaryOf(
  owner: Pick<Rater, 'person'>,
  ratings: Ratings,
): Promise<TasteSummary | null> {
  const summary = await ratings.summary(owner.person)
  if (summary.exitCode !== 0) {
    logEngineError(summary)
    return null
  }
  return summary.output
}

/** The logged-in Dono's Nota of each of `films` that has one, 1 to 10;
 * none when the engine cannot run (logged: the screen does without). */
export async function myRatingsOf(
  films: readonly string[],
  owner: Pick<Rater, 'person'>,
  ratings: Ratings,
): Promise<Readonly<Record<string, number>>> {
  if (films.length === 0) return {}
  const found = await ratings.ratingsOf(owner.person, films)
  if (found.exitCode !== 0) {
    logEngineError(found)
    return {}
  }
  return found.output
}

function refusalOf(outcome: { output: ErrorOutput }): RatingRefusal {
  const { code } = outcome.output.error
  if (code === 'unknown_target') return 'alvo'
  if (code === 'invalid_usage') return 'pedido'
  logEngineError(outcome)
  return failureOf(outcome)
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
  if (given === null) return seeOther(`${RATINGS_PATH}?erro=pedido`)
  const outcome = await ratings.rate(given, poster)
  if (outcome.exitCode !== 0)
    return seeOther(`${RATINGS_PATH}?erro=${refusalOf(outcome)}`)
  return seeOther(`${RATINGS_PATH}?feito=${outcome.output.added}`)
}
