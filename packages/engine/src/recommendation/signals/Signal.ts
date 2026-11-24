// A signal [sinal]: one way a Fato becomes Evidence in the recommendation
// (`recomendacao/sinais/`). A Pessoa signal speaks of one Presente; a film
// signal (Clima, group or alone, IMDb rating) speaks of no one and only adds
// a bonus to the order. Both return Evidence on the round's Candidates only.

import type { Effect } from 'effect'
import type { Evidence } from '../../evidence/Evidence.ts'
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
