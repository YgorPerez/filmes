// Duração máxima [duration]: passes the film that fits the time asked
// (`restricoes/duracao.py`). A film with no runtime in the Catálogo is out:
// nobody can say it fits.

import { Effect } from 'effect'
import { requestLine } from '../../evidence/Evidence.ts'
import { durationText } from '../../evidence/wording.ts'
import { engineError } from '../../runtime/EngineError.ts'
import { pass, type Constraint, type ConstraintModule } from '../constraints.ts'

export interface DurationRequest {
  /** `--duracao-max`: the time there is, in minutes. */
  readonly maxDuration?: number
}

const duration = (max: number): Constraint => ({
  name: 'duration',
  toJson: () => ({ maxMinutes: max }),
  // The Session never stores it (its `max_duration` holds the request); a
  // kept film it removes reads it from here.
  stored: () => ({ name: 'duration', max_minutes: max }),
  result: () => ({}),
  evaluate: (_, films) =>
    Effect.succeed(
      new Map(
        [...films.values()].flatMap((film) =>
          film.runtimeMinutes !== null && film.runtimeMinutes <= max
            ? [
                [
                  film.id,
                  pass([
                    requestLine(
                      film.id,
                      `duração ${durationText(film.runtimeMinutes)}, dentro do limite de ${durationText(max)}`,
                      'IMDb',
                      film.imdbDate,
                      film.id,
                    ),
                  ]),
                ] as const,
              ]
            : [],
        ),
      ),
    ),
})

export const durationModule: ConstraintModule<DurationRequest> = {
  name: 'duration',
  read: ({ maxDuration }) =>
    Effect.gen(function* () {
      if (maxDuration === undefined) return undefined
      if (maxDuration < 1)
        return yield* engineError(
          'invalid_usage',
          '--duracao-max precisa ser 1 minuto ou mais',
        )
      return duration(maxDuration)
    }),
  label: (stored) => `até ${durationText(stored['max_minutes'] as number)}`,
}
