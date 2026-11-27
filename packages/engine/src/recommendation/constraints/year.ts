// Ano de lançamento [year]: passes the film released between `since` and
// `until`, both inclusive (`restricoes/ano.py`). A film with no year in the
// Catálogo is out: nobody can say it is in the range.

import { Effect } from 'effect'
import { requestLine } from '../../evidence/Evidence.ts'
import { engineError } from '../../runtime/EngineError.ts'
import type { Candidate } from '../candidates.ts'
import { pass, type Constraint, type ConstraintModule } from '../constraints.ts'

export interface YearRequest {
  /** `--desde`: only films released that year or later. */
  readonly since?: number
  /** `--ate`: only films released that year or earlier. */
  readonly until?: number
}

/** The range as it reads: "de 1990 em diante", "até 2015", "entre 2012 e
 * 2016". */
const rangeText = (since: number | null, until: number | null): string => {
  if (until === null) return `de ${since} em diante`
  if (since === null) return `até ${until}`
  return `entre ${since} e ${until}`
}

/** What the films a short list let in despite the range are (#358): "de
 * antes de 1990", "de depois de 2015", "de fora de 2012 a 2016", "de
 * outros anos" (a range of one year, on both sides of it). */
const outsideText = (
  films: ReadonlyArray<Candidate>,
  since: number | null,
  until: number | null,
): string => {
  const before = films.some((f) => since !== null && (f.year ?? 0) < since)
  const after = films.some((f) => until !== null && (f.year ?? 0) > until)
  if (before && !after) return `de antes de ${since}`
  if (after && !before) return `de depois de ${until}`
  return since === until ? 'de outros anos' : `de fora de ${since} a ${until}`
}

const year = (since: number | null, until: number | null): Constraint => {
  const inside = (value: number) =>
    (since === null || value >= since) && (until === null || value <= until)
  const line = (film: Candidate) =>
    requestLine(
      film.id,
      `lançado em ${film.year}, ${rangeText(since, until)}`,
      'IMDb',
      film.imdbDate,
      film.id,
    )
  return {
    name: 'year',
    toJson: () => ({ since, until }),
    stored: () => ({ name: 'year', since, until }),
    result: () => ({}),
    // A film with no year stays out: nobody can say where it falls.
    relaxes: (film) => film.year !== null,
    relaxedText: (films) => outsideText(films, since, until),
    evaluate: (_, films) =>
      Effect.succeed(
        new Map(
          [...films.values()]
            .filter((film) => film.year !== null && inside(film.year))
            .map((film) => [film.id, pass([line(film)])]),
        ),
      ),
  }
}

export const yearModule: ConstraintModule<YearRequest> = {
  name: 'year',
  read: ({ since, until }) =>
    Effect.gen(function* () {
      if (since === undefined && until === undefined) return undefined
      if (since !== undefined && until !== undefined && since > until)
        return yield* engineError(
          'invalid_usage',
          `--desde ${since} depois de --ate ${until}`,
        )
      return year(since ?? null, until ?? null)
    }),
  label: (stored) =>
    rangeText(
      (stored['since'] as number | null | undefined) ?? null,
      (stored['until'] as number | null | undefined) ?? null,
    ),
}
