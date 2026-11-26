// Restrições [constraints] of the Session: limits that hold only for
// today's request and remove films before any ordering
// (`recomendacao/restricoes/__init__.py`).
//
// This file is the seam the pipeline calls; the Restrições themselves come
// in #91 (local ones) and #92 (the on-demand ones). A Restrição is a value of
// `Constraint`:
//
// - `evaluate` gets every Candidate at once, to answer with one query. A
//   film that passes carries the film lines (Evidence with `person` null)
//   that say why. A film that is out is a `Drop`, with a `cause` when the
//   Restrição counts its drops by cause (`result` gets that count and
//   returns `{}` when it does not use it). `pending` is for a Restrição that
//   needs an on-demand source (OMDb, Does the Dog Die): the film enters the
//   order and is resolved only if it reaches the top `[constraints]
//   on_demand_reach` (`consult` true); after that, `resolve` decides without
//   asking.
// - A film missing from `evaluate`'s answer is out.
//
// `makeConstraintSet` applies the ones asked for, in Python's module order
// (`CONSTRAINT_ORDER`): that order is the order of the film lines and says
// which Restrição gets the credit for a film several would remove.
//
// Each Restrição lives in its own file under `constraints/`, which exports a
// `ConstraintModule`: how it reads the request (`read`, Python's `pedido`),
// how a stored one reads (`label`, `rotulo`) and, optionally, how a refazer
// carries it over (`inherit`, `herdar`). `constraints/index.ts` holds the
// modules and the functions over all of them.

import { Effect } from 'effect'
import type { Evidence } from '../evidence/Evidence.ts'
import type { EngineServices } from '../runtime/Engine.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import type { Run } from '../runtime/Run.ts'
import type { Weights } from '../runtime/Weights.ts'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'
import type { Candidate } from './candidates.ts'

/** The Restrições by name, in the order of their Python modules
 * (`restricoes/*.py` sorted by name). */
export const CONSTRAINT_ORDER = [
  'year', // ano
  'child', // crianca
  'duration', // duracao
  'out_of_session', // fora_da_sessao
  'trigger', // gatilho
  'language', // idioma
  'similar', // parecido
  'unseen', // sem_ja_visto
  'no_slow', // sem_lento
  'no_sad', // sem_tristeza
  'series_order', // serie_na_ordem (#165, after Python left)
] as const
export type ConstraintName = (typeof CONSTRAINT_ORDER)[number]

export interface Pass {
  readonly _tag: 'Pass'
  readonly lines: ReadonlyArray<Evidence>
}
export interface Drop {
  readonly _tag: 'Drop'
  /** The cause it is counted by in `result`, or `null`. */
  readonly cause: string | null
  /** What the film's item in `dropped` says instead of the Restrição's
   * label, when it says more (the Série na ordem: who did not see what). */
  readonly detail?: DropDetail
}

/** A dropped film's own label, and the data it was written from. */
export interface DropDetail {
  readonly label: string
  readonly [field: string]: unknown
}
export type Verdict = Pass | Drop | 'pending'

/** The films a Restrição evaluates, as a JSON list for
 * `filme_id IN (SELECT value FROM json_each(?))`: it asks SQL for their rows
 * only instead of reading the whole table (as the signals do with
 * `candidatesJson`). */
export const filmsJson = (films: ReadonlyMap<string, Candidate>): string =>
  JSON.stringify([...films.keys()])

export const pass = (lines: ReadonlyArray<Evidence> = []): Pass => ({
  _tag: 'Pass',
  lines,
})
export const drop = (
  cause: string | null = null,
  detail?: DropDetail,
): Drop => ({
  _tag: 'Drop',
  cause,
  ...(detail !== undefined && { detail }),
})

/** What a Restrição can read (Python's `Contexto`). Warnings go to
 * `Run.warn`; the on-demand sources are services. */
export interface ConstraintContext {
  readonly db: Connection
  readonly weights: Weights
  readonly today: string
  readonly attendees: ReadonlyArray<string>
}

export type ConstraintEffect<A> = Effect.Effect<
  A,
  EngineError | SqliteError,
  EngineServices | Run
>

/** A Restrição as the Session stores it in `context.constraints` (Python's
 * `{"nome", **como_json()}`), with the data's English keys (`since`, `language`,
 * `max_age_rating`...). */
export interface StoredConstraint {
  readonly name: string
  readonly [field: string]: unknown
}

export interface Constraint {
  readonly name: ConstraintName
  /** What was asked, for reading the request back ("restricoes" of the
   * result), with the output's English keys. */
  readonly toJson: () => Readonly<Record<string, unknown>>
  /** What was asked, as the Session stores it. */
  readonly stored: () => StoredConstraint
  /** The Session does not store it: a refazer brings it by itself (the
   * Série na ordem's default mode). */
  readonly unstored?: boolean
  /** On a refazer: whether this request is new against the one `stored` in
   * the current version and replaces the whole list (`--manter` is
   * ignored, and whoever leaves leaves through this Restrição). Python's
   * `troca_a_lista`. */
  readonly replacesList?: (stored: StoredConstraint | undefined) => boolean
  /** What the Restrição found, next to `removed`; `drops` is cause → films. */
  readonly result: (
    drops: ReadonlyMap<string, number>,
  ) => Readonly<Record<string, unknown>>
  readonly evaluate: (
    context: ConstraintContext,
    films: ReadonlyMap<string, Candidate>,
  ) => ConstraintEffect<ReadonlyMap<string, Verdict>>
  /** Only called for a film `evaluate` left pending. */
  readonly resolve?: (
    context: ConstraintContext,
    film: Candidate,
    consult: boolean,
  ) => ConstraintEffect<Pass | Drop>
  /** A warning about the finished list (the "parecido" says when fewer
   * films passed than asked). */
  readonly listWarning?: (found: number, count: number) => string | null
}

/** A Restrição's file: how the request asks for it. `R` is the part of
 * the request it reads (Python's `configurar` arguments). */
export interface ConstraintModule<R> {
  readonly name: ConstraintName
  /** The Restrição the request asks for, `undefined` when it asks for none;
   * fails `invalid_usage` on a request that makes no sense (Python's
   * `pedido`). */
  readonly read: (
    request: R,
  ) => Effect.Effect<Constraint | undefined, EngineError>
  /** How a stored request reads ("nada triste", "até 1h40"; `rotulo`). */
  readonly label: (stored: StoredConstraint) => string
  /** On a refazer (`--sessao`): gets this Restrição as the current version
   * stored it (or `undefined`) and may put it back in the request, so it
   * keeps holding (Python's `herdar`). Returns the request. */
  readonly inherit?: <Q extends R>(
    request: Q,
    stored: StoredConstraint | undefined,
  ) => Q
}

/** Applies the Restrições asked for: before the order, and on demand after
 * it (Python's `Restricoes`). Stateful, one per recommendation. */
export interface ConstraintSet {
  /** The ones asked for, in `CONSTRAINT_ORDER`. */
  readonly constraints: ReadonlyArray<Constraint>
  /** Film → the Restrições still pending on it. */
  readonly pending: ReadonlyMap<string, ReadonlyArray<Constraint>>
  /** Film → the Restrição that removed it. */
  readonly removedBy: ReadonlyMap<string, Constraint>
  /** Film → what its Restrição said about it, when it said more. */
  readonly dropDetails: ReadonlyMap<string, DropDetail>
  /** The film lines of the Restrições the film passed. */
  readonly linesOf: (filmId: string) => ReadonlyArray<Evidence>
  /** The films that pass every Restrição or are pending on some, in the
   * given order. */
  readonly candidates: (
    films: ReadonlyMap<string, Candidate>,
  ) => ConstraintEffect<ReadonlyMap<string, Candidate>>
  /** The first `count` items of the order whose film passes the on-demand
   * Restrições. Only the films in the first `reach` places ask a source;
   * for the others, `resolve` decides without asking. */
  readonly approve: <A>(
    ordered: ReadonlyArray<A>,
    count: number,
    reach: number,
    filmOf: (item: A) => Candidate,
  ) => ConstraintEffect<ReadonlyArray<A>>
  readonly passesOnDemand: (
    film: Candidate,
    consult: boolean,
  ) => ConstraintEffect<boolean>
  /** The Restrições' warnings about the finished list. */
  readonly listWarnings: (found: number, count: number) => ReadonlyArray<string>
  /** `restricoes` of the result: by name, what was asked, what was found
   * and how many films each removed. */
  readonly toJson: () => Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >
}

/** What a `ConstraintSet` keeps as it applies its Restrições. */
interface SetState {
  readonly lines: Map<string, ReadonlyArray<Evidence>>
  readonly pending: Map<string, ReadonlyArray<Constraint>>
  readonly removedBy: Map<string, Constraint>
  readonly dropDetails: Map<string, DropDetail>
  readonly removed: Map<ConstraintName, number>
  readonly drops: Map<ConstraintName, Map<string, number>>
}

const linesIn = (state: SetState, filmId: string) =>
  state.lines.get(filmId) ?? []

const addLines = (
  state: SetState,
  filmId: string,
  more: ReadonlyArray<Evidence>,
) => state.lines.set(filmId, [...linesIn(state, filmId), ...more])

const countDrop = (
  state: SetState,
  constraint: Constraint,
  verdict: Drop,
  filmId: string,
) => {
  const { removed, drops } = state
  state.removedBy.set(filmId, constraint)
  if (verdict.detail !== undefined)
    state.dropDetails.set(filmId, verdict.detail)
  removed.set(constraint.name, (removed.get(constraint.name) ?? 0) + 1)
  if (verdict.cause !== null) {
    const causes = drops.get(constraint.name) ?? new Map<string, number>()
    causes.set(verdict.cause, (causes.get(verdict.cause) ?? 0) + 1)
    drops.set(constraint.name, causes)
  }
}

const passesOnDemandIn =
  (context: ConstraintContext, state: SetState) =>
  (film: Candidate, consult: boolean): ConstraintEffect<boolean> =>
    Effect.gen(function* () {
      const found: Evidence[] = []
      for (const constraint of state.pending.get(film.id) ?? []) {
        if (constraint.resolve === undefined)
          throw new TypeError(
            `the constraint ${constraint.name} left a film pending and cannot resolve it`,
          )
        const verdict = yield* constraint.resolve(context, film, consult)
        if (verdict._tag === 'Drop') {
          countDrop(state, constraint, verdict, film.id)
          return false
        }
        found.push(...verdict.lines)
      }
      addLines(state, film.id, found)
      return true
    })

const candidatesIn =
  (
    context: ConstraintContext,
    state: SetState,
    constraints: ReadonlyArray<Constraint>,
  ) =>
  (
    films: ReadonlyMap<string, Candidate>,
  ): ConstraintEffect<ReadonlyMap<string, Candidate>> =>
    Effect.gen(function* () {
      const { pending } = state
      const alive = new Map(films)
      for (const constraint of constraints) {
        const verdicts = yield* constraint.evaluate(context, alive)
        for (const filmId of Array.from(alive.keys())) {
          const verdict = verdicts.get(filmId) ?? drop()
          if (verdict === 'pending') {
            pending.set(filmId, [...(pending.get(filmId) ?? []), constraint])
          } else if (verdict._tag === 'Drop') {
            alive.delete(filmId)
            countDrop(state, constraint, verdict, filmId)
          } else {
            addLines(state, filmId, verdict.lines)
          }
        }
      }
      return alive
    })

export const makeConstraintSet = (
  context: ConstraintContext,
  asked: ReadonlyArray<Constraint>,
): ConstraintSet => {
  const constraints = [...asked].sort(
    (a, b) =>
      CONSTRAINT_ORDER.indexOf(a.name) - CONSTRAINT_ORDER.indexOf(b.name),
  )
  const state: SetState = {
    lines: new Map(),
    pending: new Map(),
    removedBy: new Map(),
    dropDetails: new Map(),
    removed: new Map(),
    drops: new Map(),
  }
  const passesOnDemand = passesOnDemandIn(context, state)

  return {
    constraints,
    pending: state.pending,
    removedBy: state.removedBy,
    dropDetails: state.dropDetails,
    linesOf: (filmId) => linesIn(state, filmId),
    candidates: candidatesIn(context, state, constraints),
    approve: (ordered, count, reach, filmOf) =>
      Effect.gen(function* () {
        const approved: (typeof ordered)[number][] = []
        for (const [position, item] of ordered.entries()) {
          if (approved.length === count) break
          if (yield* passesOnDemand(filmOf(item), position < reach))
            approved.push(item)
        }
        return approved
      }),
    passesOnDemand,
    listWarnings: (found, count) =>
      constraints
        .map((c) => c.listWarning?.(found, count) ?? null)
        .filter((warning): warning is string => !!warning),
    toJson: () =>
      Object.fromEntries(
        constraints.map((c) => [
          c.name,
          {
            ...c.toJson(),
            ...c.result(state.drops.get(c.name) ?? new Map()),
            removed: state.removed.get(c.name) ?? 0,
          },
        ]),
      ),
  }
}
