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
// - A Restrição with a `candidateLimit` runs after the other local filters.
//   It returns matches in preference order and cuts after resolving their
//   pending Restrições, using that order for the on-demand reach.
// - A Restrição with `relaxes` may give back a film it left out when the
//   list comes up short (#358): `candidates` keeps such a film aside and,
//   given the count, lets them in Restrição by Restrição in `RELAX_ORDER`
//   (the Parecido, then the year) until the count is filled. A relaxed film
//   comes after the ones that passed (`tierOf`). A Restrição with a
//   `candidateLimit` fills its quota from films no Restrição set aside.
//
// `makeConstraintSet` uses Python's module order (`CONSTRAINT_ORDER`) to
// present film lines and to apply Restrições within each stage.
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
  'no_mood', // nada de um Clima (#272, after Python left)
  'series_order', // serie_na_ordem (#165, after Python left)
] as const
export type ConstraintName = (typeof CONSTRAINT_ORDER)[number]

/** The Restrições a short list relaxes, first to last (#358): the
 * Parecido, then the year. The others (`unseen`, `no_sad`, the duration...)
 * and the Vetos never relax. */
export const RELAX_ORDER: ReadonlyArray<ConstraintName> = ['similar', 'year']

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

/** A Restrição a short list relaxed, and the films that came in by it
 * (#358). */
export interface RelaxedConstraint {
  /** The Restrição's name: `similar`, `year`. */
  readonly constraint: string
  /** How many films came in because of it. */
  readonly films: number
  /** What those films are, after "entraram 3": "de antes de 1990", "que
   * não são parecidos". */
  readonly text: string
}

export interface Constraint {
  readonly name: ConstraintName
  /** A refill constraint only evaluates candidates for the free places. */
  readonly appliesTo?: (filmId: string) => boolean
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
  readonly candidateLimit?: (weights: Weights) => number
  /** Only called for a film `evaluate` left pending. */
  readonly resolve?: (
    context: ConstraintContext,
    film: Candidate,
    consult: boolean,
  ) => ConstraintEffect<Pass | Drop>
  /** A warning about the finished list (the "parecido" says when fewer
   * films passed than asked). */
  readonly listWarning?: (found: number, count: number) => string | null
  /** Whether a film this Restrição leaves out may come back when the list
   * is short (#358); only the Restrições in `RELAX_ORDER` have it. */
  readonly relaxes?: (film: Candidate) => boolean
  /** What the relaxed films that came in are, after "entraram 3": "que não
   * são parecidos", "de antes de 1990". */
  readonly relaxedText?: (films: ReadonlyArray<Candidate>) => string
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
   * given order. With a `count`, while fewer than it pass, the films a
   * Restrição of `RELAX_ORDER` left out come in, one Restrição at a
   * time. */
  readonly candidates: (
    films: ReadonlyMap<string, Candidate>,
    kept?: (filmId: string) => boolean,
    count?: number,
  ) => ConstraintEffect<ReadonlyMap<string, Candidate>>
  /** The Restrições relaxed to let the film in (`RELAX_ORDER`), empty for
   * a film that passed them all. */
  readonly relaxedOf: (filmId: string) => ReadonlyArray<Constraint>
  /** 0 for a film that passed every Restrição; more for a relaxed one,
   * the later its Restrição is in `RELAX_ORDER`: it comes after. */
  readonly tierOf: (filmId: string) => number
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
  readonly lines: Map<string, Map<Constraint, ReadonlyArray<Evidence>>>
  readonly onDemandLines: Map<string, ReadonlyArray<Evidence>>
  readonly pending: Map<string, ReadonlyArray<Constraint>>
  readonly removedBy: Map<string, Constraint>
  readonly dropDetails: Map<string, DropDetail>
  readonly removed: Map<Constraint, number>
  readonly drops: Map<Constraint, Map<string, number>>
  /** Film → the Restrições of `RELAX_ORDER` it failed, while undecided;
   * after `candidates`, only the ones relaxed to let it in. */
  readonly failed: Map<string, ReadonlyArray<Constraint>>
}

const addLocalLines = (
  state: SetState,
  filmId: string,
  constraint: Constraint,
  lines: ReadonlyArray<Evidence>,
) => {
  if (lines.length === 0) return
  const filmLines = state.lines.get(filmId) ?? new Map()
  filmLines.set(constraint, lines)
  state.lines.set(filmId, filmLines)
}

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
  removed.set(constraint, (removed.get(constraint) ?? 0) + 1)
  if (verdict.cause !== null) {
    const causes = drops.get(constraint) ?? new Map<string, number>()
    causes.set(verdict.cause, (causes.get(verdict.cause) ?? 0) + 1)
    drops.set(constraint, causes)
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
      if (found.length > 0) state.onDemandLines.set(film.id, found)
      return true
    })

/** Take the first matches that pass, treating a pending drop as a drop by
 * its own Restrição. Kept films can still consult a source past the reach. */
const limitVerdicts = (
  context: ConstraintContext,
  state: SetState,
  alive: Map<string, Candidate>,
  verdicts: ReadonlyMap<string, Verdict>,
  limit: number,
  kept: (filmId: string) => boolean,
) =>
  Effect.gen(function* () {
    const passesOnDemand = passesOnDemandIn(context, state)
    const reach = context.weights.constraints.on_demand_reach
    const selected = new Map<string, Pass>()
    let position = 0
    for (const [filmId, verdict] of verdicts) {
      if (selected.size >= limit) break
      const film = alive.get(filmId)
      if (
        film === undefined ||
        verdict === 'pending' ||
        verdict._tag === 'Drop'
      )
        continue
      const consult = position < reach || kept(filmId)
      position++
      if (state.pending.has(filmId)) {
        const passes = yield* passesOnDemand(film, consult)
        state.pending.delete(filmId)
        if (!passes) {
          alive.delete(filmId)
          continue
        }
      }
      selected.set(filmId, verdict)
    }
    return selected
  })

const candidatesIn =
  (
    context: ConstraintContext,
    state: SetState,
    constraints: ReadonlyArray<Constraint>,
  ) =>
  (
    films: ReadonlyMap<string, Candidate>,
    kept: (filmId: string) => boolean = () => false,
    count = 0,
  ): ConstraintEffect<ReadonlyMap<string, Candidate>> =>
    Effect.gen(function* () {
      const { pending, failed } = state
      const alive = new Map(films)
      for (const constraint of constraints) {
        const { appliesTo, relaxes } = constraint
        const candidates = new Map(
          [...alive].filter(([id]) => appliesTo === undefined || appliesTo(id)),
        )
        const evaluated = yield* constraint.evaluate(context, candidates)
        const limit = constraint.candidateLimit?.(context.weights)
        const verdicts =
          limit === undefined
            ? evaluated
            : yield* limitVerdicts(
                context,
                state,
                alive,
                new Map([...evaluated].filter(([id]) => !failed.has(id))),
                limit,
                kept,
              )
        for (const [filmId, film] of Array.from(alive)) {
          if (!candidates.has(filmId)) continue
          // A match outside the year range still counts as similar when
          // the year relaxes. It does not use the in-range quota or reach.
          const matches =
            limit !== undefined && failed.has(filmId) ? evaluated : verdicts
          const verdict = matches.get(filmId) ?? drop()
          if (verdict === 'pending') {
            pending.set(filmId, [...(pending.get(filmId) ?? []), constraint])
          } else if (verdict._tag === 'Pass') {
            addLocalLines(state, filmId, constraint, verdict.lines)
          } else if (count > 0 && relaxes?.(film)) {
            failed.set(filmId, [...(failed.get(filmId) ?? []), constraint])
          } else {
            alive.delete(filmId)
            countDrop(state, constraint, verdict, filmId)
          }
        }
      }
      return relax(state, constraints, alive, count)
    })

/** The films that passed, and, while fewer than `count`, the ones each
 * Restrição of `RELAX_ORDER` left out, in that order; a film still left
 * out counts as dropped by the first Restrição it failed. */
const relax = (
  state: SetState,
  constraints: ReadonlyArray<Constraint>,
  alive: Map<string, Candidate>,
  count: number,
): ReadonlyMap<string, Candidate> => {
  const { failed } = state
  const allowed = new Set<ConstraintName>()
  const within = (filmId: string) =>
    (failed.get(filmId) ?? []).every((c) => allowed.has(c.name))
  const ladder = RELAX_ORDER.filter((name) =>
    constraints.some((c) => c.name === name && c.relaxes !== undefined),
  )
  for (const name of ladder) {
    // Pending films may still drop at placement. Keep the next tier
    // available until enough films are known to pass.
    if (
      [...alive.keys()].filter((id) => within(id) && !state.pending.has(id))
        .length >= count
    )
      break
    allowed.add(name)
  }
  for (const [filmId, by] of failed) {
    if (within(filmId)) continue
    alive.delete(filmId)
    failed.delete(filmId)
    countDrop(state, by[0] as Constraint, drop(), filmId)
  }
  return alive
}

export const makeConstraintSet = (
  context: ConstraintContext,
  asked: ReadonlyArray<Constraint>,
): ConstraintSet => {
  const constraints = [...asked].sort(
    (a, b) =>
      CONSTRAINT_ORDER.indexOf(a.name) - CONSTRAINT_ORDER.indexOf(b.name),
  )
  const evaluationOrder = constraints.toSorted(
    (a, b) => Number(!!a.candidateLimit) - Number(!!b.candidateLimit),
  )
  const state: SetState = {
    lines: new Map(),
    onDemandLines: new Map(),
    pending: new Map(),
    removedBy: new Map(),
    dropDetails: new Map(),
    removed: new Map(),
    drops: new Map(),
    failed: new Map(),
  }
  const passesOnDemand = passesOnDemandIn(context, state)

  return {
    constraints,
    pending: state.pending,
    removedBy: state.removedBy,
    dropDetails: state.dropDetails,
    linesOf: (filmId) => [
      ...constraints.flatMap((c) => state.lines.get(filmId)?.get(c) ?? []),
      ...(state.onDemandLines.get(filmId) ?? []),
    ],
    candidates: candidatesIn(context, state, evaluationOrder),
    relaxedOf: (filmId) => state.failed.get(filmId) ?? [],
    tierOf: (filmId) =>
      RELAX_ORDER.reduce(
        (tier, name, index) =>
          tier +
          ((state.failed.get(filmId) ?? []).some((c) => c.name === name)
            ? 2 ** index
            : 0),
        0,
      ),
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
        constraints
          .filter((c) => c.appliesTo === undefined)
          .map((c) => [
            c.name,
            {
              ...c.toJson(),
              ...c.result(state.drops.get(c) ?? new Map()),
              removed: state.removed.get(c) ?? 0,
            },
          ]),
      ),
  }
}
