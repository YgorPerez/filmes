// The Recomendação: Candidates, signals per Presente, utility and order
// (`recomendacao/__init__.py` `recomendar`, and `comandos/recomendar.py`
// up to opening the Session, which is #94's).
//
// The Presentes' Vetos and the Restrições asked for remove films before the
// signals; a Restrição that needs an on-demand source is resolved after the
// order, only at its top. Each film that passes carries in `filmLines` the
// lines that say why. The film signals go to `filmLines` too, after the
// Restrições' lines; their contributions add a bonus to the Regra's score,
// which pulls the order without touching anyone's utility.
//
// The order follows the Regra de escolha (`rule.ts`), in three bands: (0)
// some Presente has a known utility, by the Regra, with 0.5 for whoever has
// no Fact; (1) Facts only in the film signals; (2) only guesses, which show
// only when Candidates with Facts run out. Then the most voted first, then
// the id. Each film carries each Presente's utility and Evidence, grouped by
// slug in the Presentes' order; whoever has no Fact on the film gets the
// "sem fato" line. The satisfaction line also goes in `filmLines` when
// weighing who is behind changes the order.

import { Effect } from 'effect'
import { compareTuple, type PyOrderable } from '../compat/compare.ts'
import { pyRound, pySum } from '../compat/number.ts'
import { pyStrip } from '../compat/text.ts'
import { pythonError } from '../compat/python-error.ts'
import {
  contribution,
  evidenceToJson,
  withoutFact,
  type Evidence,
  type EvidenceJson,
} from '../evidence/Evidence.ts'
import type { RatingScale } from '../evidence/ruler.ts'
import type { EngineServices } from '../runtime/Engine.ts'
import { Environment } from '../runtime/Environment.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { Run } from '../runtime/Run.ts'
import { text } from '../sqlite/row.ts'
import { Sqlite, type Connection, type SqliteError } from '../sqlite/Sqlite.ts'
import { resolveAttendees } from './attendees.ts'
import { attributionsOf, type Attribution } from './attributions.ts'
import {
  chooseCandidates,
  type Candidate,
  type CandidateSelection,
} from './candidates.ts'
import {
  makeConstraintSet,
  type Constraint,
  type ConstraintContext,
} from './constraints.ts'
import { readConstraints, type ConstraintRequest } from './constraints/index.ts'
import {
  groupSatisfaction,
  satisfactionLine,
  type GroupSatisfaction,
} from './group-satisfaction.ts'
import { filmHeader, type FilmHeader } from './header.ts'
import {
  byConstraint,
  byMinRating,
  byVeto,
  droppedFilms,
  isKept,
  isNew,
  keptWarning,
  place,
  type Dropped,
  type RemovalCause,
  type Regenerate,
} from './kept.ts'
import { resolveMoods } from './moods.ts'
import {
  DEFAULT_RULE,
  ruleKey,
  ruleToJson,
  usesSatisfaction,
  type Rule,
  type RuleName,
} from './rule.ts'
import { readRatingScale } from '../people/rating-scale.ts'
import { SIGNALS } from './signals/index.ts'
import { predictRatings } from './taste-neighbors.ts'
import type { Round } from './signals/Signal.ts'
import { individualUtility } from './utility.ts'
import { applyVetoes, type VetoReport } from './vetoes.ts'

/** A Presente's Nota prevista [predicted rating] of a film (#174), from
 * her taste neighbours. */
export interface PredictedRating {
  /** 1 to 10, on her scale, rounded to 2 places. */
  readonly value: number
  /** How many taste neighbours rated the film. */
  readonly raters: number
  /** How uncertain `value` is: the standard deviation of each neighbour's
   * reading on her scale, 1 to 10, rounded to 2 places. */
  readonly deviation: number
}

export interface RecommendedFilm extends FilmHeader {
  readonly position: number
  readonly id: string
  readonly title: string
  readonly year: number | null
  readonly runtimeMinutes: number | null
  readonly coverage: {
    /** How many Presentes have a Fact on the film. */
    readonly withFact: number
    readonly attendees: number
    readonly withoutFact: ReadonlyArray<string>
  }
  /** Band 2: nobody has a Fact and no film signal backs it. */
  readonly onlyGuesses: boolean
  /** By Presente, rounded to 4 places; `null` with no Fact. */
  readonly utility: Readonly<Record<string, number | null>>
  /** By Presente, only those whose taste neighbours predict a rating;
   * absent when nobody's do. */
  readonly predictedRating?: Readonly<Record<string, PredictedRating>>
  /** By Presente, in the Presentes' order; the strongest first. */
  readonly evidence: Readonly<Record<string, ReadonlyArray<EvidenceJson>>>
  /** The Restrições' lines, the film signals and the satisfaction line. */
  readonly filmLines: ReadonlyArray<EvidenceJson>
  /** Only when regenerating: the previous version did not show it. */
  readonly new?: boolean
}

export interface Recommendation {
  readonly attendees: ReadonlyArray<string>
  readonly rule: ReturnType<typeof ruleToJson>
  /** By Presente with a reaction in her recent shared Sessions, rounded to
   * 4 places; empty when the Regra or a Session alone does not weigh it. */
  readonly satisfaction: Readonly<Record<string, number>>
  /** The highest satisfaction minus the lowest, rounded to 4 places; null
   * with fewer than two. */
  readonly disagreement: number | null
  readonly vetoes: ReadonlyArray<VetoReport>
  readonly moods: ReadonlyArray<string>
  readonly films: ReadonlyArray<RecommendedFilm>
  readonly constraints: Readonly<
    Record<string, Readonly<Record<string, unknown>>>
  >
  readonly warnings: ReadonlyArray<string>
  readonly attributions: ReadonlyArray<Attribution>
  /** Only when regenerating: the kept films that stayed. */
  readonly kept?: ReadonlyArray<string>
  /** Only when regenerating: what left the previous version, and why. */
  readonly dropped?: ReadonlyArray<Dropped>
}

export interface RankOptions {
  /** Slugs, already resolved, in the request's order. */
  readonly attendees: ReadonlyArray<string>
  readonly count: number
  readonly rule?: Rule
  readonly constraints?: ReadonlyArray<Constraint>
  /** Clima names as asked. */
  readonly moods?: ReadonlyArray<string>
  /** The Candidates prepared once for many rounds (`avaliar`). */
  readonly selection?: CandidateSelection
  /** A refazer of a Session (Python's `regerar`): the kept films stay at
   * their number, and each film says whether it is new. */
  readonly regenerate?: Regenerate
}

type Key = readonly PyOrderable[]

interface Ordered {
  readonly key: Key
  readonly film: Candidate
  readonly utilities: ReadonlyMap<string, number | null>
  readonly evidence: ReadonlyArray<Evidence>
}

const orderKey = (
  byRule: readonly number[] | null,
  hasFact: boolean,
  film: Candidate,
  bonus: number,
): Key => {
  const band: Key =
    byRule !== null
      ? [0, byRule.map((v) => -(v + bonus))]
      : [hasFact ? 1 : 2, [-bonus]]
  return [...band, -film.votes, film.id]
}

const byKey = (a: { key: Key }, b: { key: Key }) =>
  compareTuple([...a.key], [...b.key])

/** Who is behind in satisfaction and made this film go up: the film gained
 * places with the satisfaction, the Pessoa has a Fact on it and is not the
 * default Regra's minimum (the film is hers: weighed by the satisfaction,
 * the films where she is the minimum fell and this one stayed). The minimum
 * is among those with a Fact: the 0.5 of whoever has none does not count. */
const wentUpBySatisfaction = (
  filmId: string,
  contested: ReadonlyMap<string, number>,
  positionUnweighed: ReadonlyMap<string, number>,
  utilities: ReadonlyMap<string, number | null>,
  adjustment: ReadonlyMap<string, number>,
): ReadonlyArray<string> => {
  const position = contested.get(filmId)
  const before = positionUnweighed.get(filmId)
  if (adjustment.size === 0 || position === undefined) return []
  if (before === undefined) throw pythonError('KeyError', `'${filmId}'`)
  if (position >= before) return []
  const adjusted = [...utilities]
    .filter((entry): entry is [string, number] => entry[1] !== null)
    .map(([p, u]): [string, number] => [p, u - (adjustment.get(p) ?? 0.0)])
  if (adjusted.length === 0)
    throw pythonError('ValueError', 'min() iterable argument is empty')
  const minimum = Math.min(...adjusted.map(([, u]) => u))
  return adjusted
    .filter(([p, u]) => adjustment.has(p) && u > minimum)
    .map(([p]) => p)
}

/** The recommendation for Presentes already resolved, on an open read
 * connection (Python's `recomendar(conn, ...)`). Warnings go to the
 * request's `Run`; the result carries the ones this call added. */
export const rank = (
  db: Connection,
  options: RankOptions,
): Effect.Effect<
  Recommendation,
  EngineError | SqliteError,
  EngineServices | Run
> =>
  Effect.gen(function* () {
    const { weights } = yield* Environment
    const run = yield* Run
    const warningsBefore = (yield* run.warnings).length
    const { attendees, count, selection, regenerate } = options
    const kept = (id: string) =>
      regenerate !== undefined && isKept(regenerate, id)
    const rule = options.rule ?? DEFAULT_RULE

    // Every Presente's Vetos hold, whatever the Regra.
    const eligible = selection?.films ?? (yield* chooseCandidates(db, weights))
    const vetoes = yield* applyVetoes(
      db,
      attendees,
      eligible,
      weights.tag_vetoes,
    )
    const moods = yield* resolveMoods(options.moods ?? [])
    for (const warning of moods.warnings) yield* run.warn(warning)
    const context: ConstraintContext = {
      db,
      weights,
      today: run.today,
      attendees,
    }
    const asked = makeConstraintSet(context, options.constraints ?? [])
    const round: Round = {
      db,
      weights,
      today: run.today,
      candidates: yield* asked.candidates(vetoes.remaining),
      attendees,
      moods: moods.moods,
    }
    // A kept film a Veto or a Restrição removed: the cause, for `dropped`.
    const removed = new Map<string, RemovalCause>()
    for (const filmId of regenerate?.positions.keys() ?? []) {
      const film = eligible.get(filmId)
      if (film === undefined)
        removed.set(filmId, yield* byMinRating(db, filmId, weights.catalog))
      else if (!vetoes.remaining.has(filmId))
        removed.set(
          filmId,
          yield* byVeto(db, attendees, film, weights.tag_vetoes),
        )
      else if (!round.candidates.has(filmId)) {
        const by = asked.removedBy.get(filmId)
        if (by === undefined) throw pythonError('KeyError', `'${filmId}'`)
        removed.set(filmId, byConstraint(by))
      }
    }

    const byFilm = new Map<string, Evidence[]>()
    const ofFilm = new Map<string, Evidence[]>()
    const collect = (
      into: Map<string, Evidence[]>,
      evidence: ReadonlyArray<Evidence>,
    ) => {
      for (const e of evidence)
        into.set(e.filmId, [...(into.get(e.filmId) ?? []), e])
    }
    for (const signal of SIGNALS) {
      if (signal.forPerson)
        for (const person of attendees)
          collect(byFilm, yield* signal.forPerson(round, person))
      if (signal.forFilm) collect(ofFilm, yield* signal.forFilm(round))
    }

    // Satisfação (#176): only in the default Regra and in a group.
    // `adjustment` is factor × how far each Pessoa is below the highest.
    const group: GroupSatisfaction | null =
      usesSatisfaction(rule) && attendees.length > 1
        ? yield* groupSatisfaction(db, attendees, weights.satisfaction.window)
        : null
    const factor = weights.satisfaction.factor
    const adjustment = new Map(
      factor && group !== null
        ? [...group.behind].map(([p, gap]) => [p, factor * gap])
        : [],
    )

    let ids: Iterable<string> = round.candidates.keys()
    if (
      selection !== undefined &&
      adjustment.size === 0 &&
      asked.pending.size === 0
    ) {
      // With no lookup that could refuse a film after the order, the other
      // guesses never reach the top when there are already `count` more
      // voted ones.
      const popular = selection.popular
        .filter((id) => round.candidates.has(id))
        .slice(0, count)
      const some = new Set([...byFilm.keys(), ...ofFilm.keys(), ...popular])
      if (regenerate !== undefined)
        for (const id of regenerate.positions.keys())
          if (round.candidates.has(id)) some.add(id)
      ids = some
    }
    const ordered: Ordered[] = []
    const unweighed: { key: Key; id: string }[] = []
    for (const filmId of ids) {
      const film = round.candidates.get(filmId)
      if (film === undefined) throw pythonError('KeyError', `'${filmId}'`)
      const evidence = byFilm.get(filmId) ?? []
      const utilities = new Map(
        attendees.map((person) => [
          person,
          individualUtility(
            evidence.filter((e) => e.person === person),
            weights,
          ),
        ]),
      )
      const filmSignals = ofFilm.get(filmId) ?? []
      const bonus = pySum(filmSignals.map((e) => contribution(e, weights)))
      const hasFact = [...evidence, ...filmSignals].some(
        (e) => e.kind !== 'guess' && e.countsAsFact,
      )
      ordered.push({
        key: orderKey(
          ruleKey(rule, utilities, adjustment),
          hasFact,
          film,
          bonus,
        ),
        film,
        utilities,
        evidence,
      })
      if (adjustment.size > 0)
        unweighed.push({
          key: orderKey(ruleKey(rule, utilities), hasFact, film, bonus),
          id: filmId,
        })
    }
    ordered.sort(byKey)
    const reach = weights.constraints.on_demand_reach
    let placed: ReadonlyArray<readonly [number, Ordered]>
    if (regenerate !== undefined) {
      const fixed: Ordered[] = []
      for (const item of ordered) {
        if (!kept(item.film.id)) continue
        if (yield* asked.passesOnDemand(item.film, true)) fixed.push(item)
        else {
          const by = asked.removedBy.get(item.film.id)
          if (by === undefined)
            throw pythonError('KeyError', `'${item.film.id}'`)
          removed.set(item.film.id, byConstraint(by))
        }
      }
      const others = ordered.filter((item) => !kept(item.film.id))
      const free = yield* asked.approve(
        others,
        Math.max(count - fixed.length, 0),
        reach,
        (item) => item.film,
      )
      placed = place(regenerate, fixed, free, count, (item) => item.film.id)
    } else {
      const approved = yield* asked.approve(
        ordered,
        count,
        reach,
        (item) => item.film,
      )
      placed = approved.map((item, i) => [i + 1, item] as const)
    }
    const approvedIds = new Set(placed.map(([, item]) => item.film.id))
    // The two orders with the same verdicts, without asking an on-demand
    // source for more answers. When regenerating, only the free places
    // compete: each one's order is among the films not kept, and the kept
    // film, there because the Dono asked, gets no satisfaction line.
    const positionUnweighed = new Map(
      unweighed
        .sort(byKey)
        .filter(
          ({ id }) =>
            (approvedIds.has(id) || !asked.pending.get(id)?.length) &&
            !kept(id),
        )
        .map(({ id }, i) => [id, i + 1]),
    )
    const contested = new Map<string, number>()
    for (const [, item] of placed)
      if (!kept(item.film.id)) contested.set(item.film.id, contested.size + 1)

    const names = new Map<string, string>()
    if (adjustment.size > 0)
      for (const row of yield* db.all('SELECT slug, nome FROM pessoas'))
        names.set(text(row, 'slug'), text(row, 'nome'))
    const strongestFirst = (a: Evidence, b: Evidence) =>
      compareTuple(
        [-Math.abs(contribution(a, weights)), a.factId ?? ''],
        [-Math.abs(contribution(b, weights)), b.factId ?? ''],
      )
    const scales = new Map<string, RatingScale>()
    for (const p of group?.people.keys() ?? [])
      scales.set(p, yield* readRatingScale(db, p, weights))
    const films: RecommendedFilm[] = []
    for (const [position, { key, film, utilities, evidence }] of placed) {
      const all = [
        ...evidence,
        ...[...utilities]
          .filter(([, u]) => u === null)
          .map(([p]) => withoutFact(p, film.id)),
      ].sort(strongestFirst)
      // Film signals: the strongest first; on a tie, the order of the
      // Climas asked for.
      const signalLines = [...(ofFilm.get(film.id) ?? [])].sort(
        (a, b) =>
          Math.abs(contribution(b, weights)) -
          Math.abs(contribution(a, weights)),
      )
      const satisfactionLines =
        group === null
          ? []
          : wentUpBySatisfaction(
              film.id,
              contested,
              positionUnweighed,
              utilities,
              adjustment,
            ).map((p) => {
              const scale = scales.get(p)
              if (scale === undefined) throw pythonError('KeyError', `'${p}'`)
              return satisfactionLine(
                p,
                names.get(p) ?? p,
                group,
                scale,
                film.id,
                run.today,
              )
            })
      const lines = [
        ...asked.linesOf(film.id),
        ...signalLines,
        ...satisfactionLines,
      ]
      const predicted: Array<[string, PredictedRating]> = []
      for (const p of attendees) {
        const prediction = (yield* predictRatings(round, p)).get(film.id)
        if (prediction !== undefined)
          predicted.push([
            p,
            {
              value: pyRound(prediction.value, 2),
              raters: prediction.raters,
              deviation: pyRound(prediction.deviation, 2),
            },
          ])
      }
      const withoutFactOn = [...utilities]
        .filter(([, u]) => u === null)
        .map(([p]) => p)
      films.push({
        position,
        id: film.id,
        title: film.title,
        year: film.year,
        runtimeMinutes: film.runtimeMinutes,
        ...(yield* filmHeader(db, film)),
        coverage: {
          withFact: utilities.size - withoutFactOn.length,
          attendees: utilities.size,
          withoutFact: withoutFactOn,
        },
        onlyGuesses: key[0] === 2,
        utility: Object.fromEntries(
          [...utilities].map(([p, u]) => [
            p,
            u === null ? null : pyRound(u, 4),
          ]),
        ),
        ...(predicted.length > 0 && {
          predictedRating: Object.fromEntries(predicted),
        }),
        evidence: Object.fromEntries(
          attendees.map((p) => [
            p,
            all
              .filter((e) => e.person === p)
              .map((e) => evidenceToJson(e, weights)),
          ]),
        ),
        filmLines: lines.map((e) => evidenceToJson(e, weights)),
        ...(regenerate !== undefined && { new: isNew(regenerate, film.id) }),
      })
    }
    for (const warning of asked.listWarnings(films.length, count))
      yield* run.warn(warning)
    if (regenerate !== undefined)
      for (const [filmId, cause] of removed)
        yield* run.warn(keptWarning(regenerate, filmId, cause))

    return {
      attendees,
      rule: ruleToJson(rule),
      satisfaction: Object.fromEntries(
        [...(group?.people ?? [])].map(([p, s]) => [
          p,
          pyRound(s.satisfaction, 4),
        ]),
      ),
      disagreement:
        group === null || group.disagreement === null
          ? null
          : pyRound(group.disagreement, 4),
      vetoes: vetoes.acted,
      moods: moods.moods.map((m) => m.name),
      films,
      constraints: asked.toJson(),
      warnings: (yield* run.warnings).slice(warningsBefore),
      attributions: attributionsOf([
        ...films.flatMap((f) =>
          [f.filmLines, ...Object.values(f.evidence)].flatMap((lines) =>
            lines.map((e) => e.source),
          ),
        ),
        ...films.filter((f) => f.poster || f.titlePt).map(() => 'TMDB'),
      ]),
      ...(regenerate !== undefined && {
        kept: films.filter((f) => kept(f.id)).map((f) => f.id),
        dropped: yield* droppedFilms(
          db,
          attendees,
          regenerate,
          new Set(films.map((f) => f.id)),
          removed,
        ),
      }),
    }
  })

/** A recommendation request, as an edge (the MCP, the app) gives it. The Restrições it asks for are its
 * `ConstraintRequest` fields (`maxDuration`, `since`...). */
export interface RecommendRequest extends ConstraintRequest {
  /** Slugs, names or nicknames, or "dono"; an item may hold several
   * separated by commas. */
  readonly attendees: ReadonlyArray<string>
  /** How many films; `[recommendation] size` when absent. */
  readonly count?: number
  /** `default` unless `by` is given, then `by`. */
  readonly rule?: RuleName
  /** With the `by` rule, the Pessoa whose taste orders. */
  readonly by?: string
  readonly moods?: ReadonlyArray<string>
  /** Restrições already built, after the ones the fields ask for. */
  readonly constraints?: ReadonlyArray<Constraint>
}

const resolveRule = (
  db: Connection,
  request: RecommendRequest,
  attendees: ReadonlyArray<string>,
): Effect.Effect<Rule, EngineError | SqliteError> =>
  Effect.gen(function* () {
    const name = request.rule ?? (request.by ? 'by' : 'default')
    if (name !== 'by') {
      if (request.by)
        return yield* engineError(
          'invalid_usage',
          `--de só vale com --regra de, não com --regra ${name}`,
        )
      return { name }
    }
    if (!request.by)
      return yield* engineError(
        'invalid_usage',
        '--regra de precisa de --de com a Pessoa cujo gosto ordena',
      )
    const [person = ''] = yield* resolveAttendees(db, [request.by])
    if (!attendees.includes(person))
      return yield* engineError(
        'invalid_usage',
        `--de ${request.by}: ${person} não está entre os Presentes`,
      )
    return { name: 'by', person }
  })

/** `recomendar` without the Session: the Presentes resolved, the Regra
 * checked, and the ranked films with their Evidence. */
export const recommend = (
  request: RecommendRequest,
): Effect.Effect<
  Recommendation,
  EngineError | SqliteError,
  EngineServices | Run
> =>
  recommendAsked(request).pipe(
    Effect.map(({ recommendation }) => recommendation),
  )

/** How many films the request asks for; `invalid_usage` below 1. */
export const requestCount = (
  request: Pick<RecommendRequest, 'count'>,
): Effect.Effect<number, EngineError, Environment> =>
  Effect.gen(function* () {
    const { weights } = yield* Environment
    const count = request.count ?? weights.recommendation.size
    if (count < 1)
      return yield* engineError(
        'invalid_usage',
        '--quantos precisa ser 1 ou mais',
      )
    return count
  })

/** The ranking of a request whose count and Restrições are already read:
 * the Presentes resolved, the Regra checked, then `rank`. */
export const rankRequest = (
  request: RecommendRequest,
  count: number,
  asked: ReadonlyArray<Constraint>,
  regenerate?: Regenerate,
): Effect.Effect<
  Recommendation,
  EngineError | SqliteError,
  EngineServices | Run
> =>
  Effect.gen(function* () {
    const names = request.attendees
      .flatMap((item) => item.split(','))
      .filter((name) => pyStrip(name) !== '')
    return yield* (yield* Sqlite).read((db) =>
      Effect.gen(function* () {
        const attendees = yield* resolveAttendees(db, names)
        const rule = yield* resolveRule(db, request, attendees)
        return yield* rank(db, {
          attendees,
          count,
          rule,
          constraints: asked,
          moods: request.moods ?? [],
          ...(regenerate !== undefined && { regenerate }),
        })
      }),
    )
  })

/** `recommend`, with the Restrições it applied: the same values, so what
 * they learnt while evaluating (the similar's reference titles) reaches
 * the Session (Python's `_contexto` reads them after `recomendar`). */
export const recommendAsked = (
  request: RecommendRequest,
): Effect.Effect<
  {
    readonly recommendation: Recommendation
    readonly asked: ReadonlyArray<Constraint>
  },
  EngineError | SqliteError,
  EngineServices | Run
> =>
  Effect.gen(function* () {
    const count = yield* requestCount(request)
    const asked = [
      ...(yield* readConstraints(request)),
      ...(request.constraints ?? []),
    ]
    const recommendation = yield* rankRequest(request, count, asked)
    return { recommendation, asked }
  })
