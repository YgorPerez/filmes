// The critics' score (#282): Rotten Tomatoes and Metacritic, from the OMDb
// answer of a film in the first `[constraints] on_demand_reach` places,
// the only films OMDb's terms let filmes ask about.
//
// Each score is a film line ("93% no Rotten Tomatoes"). The bonus is
// `[critics] weight` times the mean of the film's scores, from 0 to 1,
// split evenly over its lines. Like the IMDb rating's, it adds to the
// Regra's score and never to anyone's utility, and the lines do not count
// as a Fact. A film without a score gets no line and no bonus.

import { Effect } from 'effect'
import { factId, pyInt } from '../compat/fact-id.ts'
import { makeEvidence, type Evidence } from '../evidence/Evidence.ts'
import { criticsStrength } from '../evidence/ruler.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import type { Run } from '../runtime/Run.ts'
import { Omdb, OMDB_NAME } from '../sources/Omdb.ts'
import type { SqliteError } from '../sqlite/Sqlite.ts'

/** The `fato_id` prefix of the lines, which tells them apart in the
 * output. */
export const CRITICS_TABLE = 'critics'

/** The film's critics' lines, each carrying its share of the bonus. */
export const criticsLines = (
  filmId: string,
  weight: number,
): Effect.Effect<
  ReadonlyArray<Evidence>,
  EngineError | SqliteError,
  Omdb | Run
> =>
  Effect.gen(function* () {
    const answer = yield* (yield* Omdb).critics(filmId)
    if (answer === undefined) return []
    const scores: Array<readonly [string, number, string]> = []
    if (answer.rottenTomatoes !== undefined)
      scores.push([
        'Rotten Tomatoes',
        answer.rottenTomatoes,
        `${answer.rottenTomatoes}% no Rotten Tomatoes`,
      ])
    if (answer.metacritic !== undefined)
      scores.push([
        'Metacritic',
        answer.metacritic,
        `nota ${answer.metacritic} no Metacritic`,
      ])
    return scores.map(([source, value, text]) =>
      makeEvidence({
        person: null,
        filmId,
        text,
        source: OMDB_NAME,
        date: answer.date,
        strength: criticsStrength(),
        kind: 'metadata',
        factId: factId(CRITICS_TABLE, filmId, source, pyInt(value)),
        base: (weight * value) / 100 / scores.length,
        countsAsFact: false,
      }),
    )
  })
