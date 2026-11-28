// A signal [sinal]: one way a Fato becomes Evidence in the recommendation
// (`recomendacao/sinais/`). A Pessoa signal speaks of one Presente; a film
// signal (Clima, group or alone, IMDb rating) speaks of no one and only adds
// a bonus to the order. Both return Evidence on the round's Candidates only.

import type { Effect } from 'effect'
import { pythonError } from '../../compat/python-error.ts'
import type { Evidence } from '../../evidence/Evidence.ts'
import type { RatingScale } from '../../evidence/ruler.ts'
import type { Environment } from '../../runtime/Environment.ts'
import type { EngineError } from '../../runtime/EngineError.ts'
import type { Weights } from '../../runtime/Weights.ts'
import type { Connection, SqliteError } from '../../sqlite/Sqlite.ts'
import type { Candidate } from '../candidates.ts'
import type { Mood } from '../moods.ts'

/** What the signals get (Python's `Rodada`). */
export interface Round {
  readonly db: Connection
  readonly weights: Weights
  /** `YYYY-MM-DD`, the request's. */
  readonly today: string
  /** Left after the Vetos and the Restrições, in id order. */
  readonly candidates: ReadonlyMap<string, Candidate>
  readonly attendees: ReadonlyArray<string>
  /** The Climas asked for, in the order asked. */
  readonly moods: ReadonlyArray<Mood>
  readonly refillMoods?: {
    readonly moods: ReadonlyArray<Mood>
    readonly kept: (filmId: string) => boolean
  }
  /** Each Presente's Escala, read once for the round: every signal reads
   * her Notas on the same scale. */
  readonly scales: ReadonlyMap<string, RatingScale>
}

/** The Escala of a Presente of the round. */
export const scaleOf = (round: Round, person: string): RatingScale => {
  const scale = round.scales.get(person)
  if (scale === undefined) throw pythonError('KeyError', `'${person}'`)
  return scale
}

export type SignalEffect = Effect.Effect<
  ReadonlyArray<Evidence>,
  EngineError | SqliteError,
  Environment
>

export interface Signal {
  /** Python's module name: the signals run in its alphabetical order, and
   * that order is the order of the Evidence (R8). */
  readonly module: string
  /** Evidence about one Presente. */
  readonly forPerson?: (round: Round, person: string) => SignalEffect
  /** Film lines, about no one (`person` null). */
  readonly forFilm?: (round: Round) => SignalEffect
}

const candidateLists = new WeakMap<ReadonlyMap<string, Candidate>, string>()

/** The round's Candidate ids as a JSON list, for
 * `filme_id IN (SELECT value FROM json_each(?))`: a signal asks SQL for
 * the Candidates' rows only instead of handing the whole catalog to JS.
 * Built once per round. */
export const candidatesJson = (round: Round): string => {
  const cached = candidateLists.get(round.candidates)
  if (cached !== undefined) return cached
  const list = JSON.stringify([...round.candidates.keys()])
  candidateLists.set(round.candidates, list)
  return list
}
