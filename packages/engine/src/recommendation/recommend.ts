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
// weighing who is behind changes the order. The critics' score
// (`critics.ts`, #282) then asks OMDb about the first `[constraints]
// on_demand_reach` films and reorders only among them. Then MMR
// (`diversity.ts`, #177) picks the first places for Diversidade, before the
// on-demand Restrições.
//
// With a seed (the Session id), the Aposta (`bet.ts`, #178) takes the place
// `[bet] position`: the Regra (and MMR) fills the other places, and the bet
// is drawn among the Candidates left, with a good Nota prevista and little
// Evidence. MMR does not move the bet.

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
import type { Weights } from '../runtime/Weights.ts'
import { readBetRecord } from '../sessions/bet-record.ts'
import { text } from '../sqlite/row.ts'
import { Sqlite, type Connection, type SqliteError } from '../sqlite/Sqlite.ts'
import { resolveAttendees } from './attendees.ts'
import { attributionsOf, type Attribution } from './attributions.ts'
import {
  betPolicy,
  cautiousBetLine,
  drawBets,
  hasLittleEvidence,
  type BetCandidate,
  type BetOdds,
} from './bet.ts'
import {
  chooseCandidates,
  type Candidate,
  type CandidateSelection,
} from './candidates.ts'
import {
  makeConstraintSet,
  RELAX_ORDER,
  type Constraint,
  type ConstraintContext,
  type ConstraintSet,
  type RelaxedConstraint,
} from './constraints.ts'
import { readConstraints, type ConstraintRequest } from './constraints/index.ts'
import { criticsLines } from './critics.ts'
import { diversify, type Scored } from './diversity.ts'
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
import { scaleOf, type Round } from './signals/Signal.ts'
import { individualUtility } from './utility.ts'
import { applyVetoes, type VetoReport } from './vetoes.ts'

/** A Presente's Nota prevista [predicted rating] of a film (#174), from
 * her taste neighbours, calibrated to her own Notas (#210). */
export interface PredictedRating {
  /** 1 to 10, on her scale, rounded to 2 places: what the Cartaz shows. */
  readonly value: number
  /** `value` before the calibration, for `evaluate`; the Session does not
   * keep it. */
  readonly raw: number
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
  /** Only on the Aposta [bet] (#178). */
  readonly bet?: true
  /** The Histórico de apostas required a higher Nota prevista. */
  readonly cautiousBet?: true
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
  /** Only when the list came up short and a Restrição was relaxed to fill
   * it (#358): which, and how many of the films came in by it. */
  readonly relaxed?: ReadonlyArray<RelaxedConstraint>
}

export interface RankOptions {
  /** Slugs, already resolved, in the request's order. */
  readonly attendees: ReadonlyArray<string>
  readonly count: number
  readonly rule?: Rule
  readonly constraints?: ReadonlyArray<Constraint>
  /** Clima names as asked. */
  readonly moods?: ReadonlyArray<string>
  /** Climas from Cartaz comments, for open places only. */
  readonly refillMoods?: ReadonlyArray<string>
  /** The Candidates prepared once for many rounds (`avaliar`). */
  readonly selection?: CandidateSelection
  /** A refazer of a Session (Python's `regerar`): the kept films stay at
   * their number, and each film says whether it is new. */
  readonly regenerate?: Regenerate
  /** The Aposta's draws (the Session id); without it, no bet. */
  readonly seed?: string
  /** The Session being redone, excluded from its own bet record. */
  readonly session?: string
  /** A short list relaxes the Parecido, then the year, to fill `count`
   * (#358). The Session's Recomendação asks for it; without it, the
   * Restrições hold as asked and the list may come out shorter. */
  readonly relax?: boolean
}

type Key = readonly PyOrderable[]

interface Ordered extends Scored {
  readonly key: Key
  readonly film: Candidate
  readonly utilities: ReadonlyMap<string, number | null>
  readonly evidence: ReadonlyArray<Evidence>
}

/** How many bands a tier of relaxed films holds (#358). */
const BANDS = 3

/** 0 with some known utility, 1 with Facts only in the film signals, 2
 * with guesses only; a film a short list let in by relaxing a Restrição
 * (`tier` above 0) comes after all of those (#358). */
const bandOf = (
  byRule: readonly number[] | null,
  hasFact: boolean,
  tier: number,
): number => tier * BANDS + (byRule !== null ? 0 : hasFact ? 1 : 2)

const orderKey = (
  byRule: readonly number[] | null,
  hasFact: boolean,
  film: Candidate,
  bonus: number,
  tier: number,
): Key => [
  bandOf(byRule, hasFact, tier),
  byRule !== null ? byRule.map((v) => -(v + bonus)) : [-bonus],
  -film.votes,
  film.id,
]

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

type RankEffect<A> = Effect.Effect<
  A,
  EngineError | SqliteError,
  EngineServices | Run
>

/** What every step of `rank` reads. */
interface Ranking {
  readonly db: Connection
  readonly weights: Weights
  readonly run: Run['Service']
  readonly options: RankOptions
  readonly rule: Rule
  /** Before the Vetos. */
  readonly eligible: ReadonlyMap<string, Candidate>
  readonly vetoes: {
    readonly remaining: ReadonlyMap<string, Candidate>
    readonly acted: ReadonlyArray<VetoReport>
  }
  readonly asked: ConstraintSet
  readonly round: Round
  readonly kept: (id: string) => boolean
}

const prepare = (db: Connection, options: RankOptions): RankEffect<Ranking> =>
  Effect.gen(function* () {
    const { weights } = yield* Environment
    const run = yield* Run
    const { attendees, selection, regenerate } = options

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
    const refill = options.refillMoods?.length
      ? (yield* resolveMoods(options.refillMoods)).moods
      : []
    const kept = (id: string) =>
      regenerate !== undefined && isKept(regenerate, id)
    const context: ConstraintContext = {
      db,
      weights,
      today: run.today,
      attendees,
    }
    const asked = makeConstraintSet(context, options.constraints ?? [])
    const scales = new Map<string, RatingScale>()
    for (const p of attendees)
      scales.set(p, yield* readRatingScale(db, p, weights))
    const round: Round = {
      db,
      weights,
      today: run.today,
      candidates: yield* asked.candidates(
        vetoes.remaining,
        kept,
        options.relax ? options.count : 0,
      ),
      attendees,
      moods: moods.moods,
      ...(refill.length > 0 && { refillMoods: { moods: refill, kept } }),
      scales,
    }
    return {
      db,
      weights,
      run,
      options,
      rule: options.rule ?? DEFAULT_RULE,
      eligible,
      vetoes,
      asked,
      round,
      kept,
    }
  })

/** A kept film a Veto or a Restrição removed: the cause, for `dropped`. */
const keptRemovals = (r: Ranking): RankEffect<Map<string, RemovalCause>> =>
  Effect.gen(function* () {
    const { db, weights, eligible, vetoes, round, asked } = r
    const removed = new Map<string, RemovalCause>()
    for (const filmId of r.options.regenerate?.positions.keys() ?? []) {
      const film = eligible.get(filmId)
      if (film === undefined)
        removed.set(filmId, yield* byMinRating(db, filmId, weights.catalog))
      else if (!vetoes.remaining.has(filmId))
        removed.set(
          filmId,
          yield* byVeto(db, r.options.attendees, film, weights.tag_vetoes),
        )
      else if (!round.candidates.has(filmId)) {
        const by = asked.removedBy.get(filmId)
        if (by === undefined) throw pythonError('KeyError', `'${filmId}'`)
        removed.set(filmId, byConstraint(by, asked.dropDetails.get(filmId)))
      }
    }
    return removed
  })

type ByFilm = ReadonlyMap<string, ReadonlyArray<Evidence>>

const collect = (
  into: Map<string, Evidence[]>,
  evidence: ReadonlyArray<Evidence>,
) => {
  for (const e of evidence)
    into.set(e.filmId, [...(into.get(e.filmId) ?? []), e])
}

/** The Evidence of the Pessoa signals (`byFilm`) and the film signals
 * (`ofFilm`), by film. */
const signalEvidence = (
  round: Round,
): RankEffect<{ readonly byFilm: ByFilm; readonly ofFilm: ByFilm }> =>
  Effect.gen(function* () {
    const byFilm = new Map<string, Evidence[]>()
    const ofFilm = new Map<string, Evidence[]>()
    for (const signal of SIGNALS) {
      if (signal.forPerson)
        for (const person of round.attendees)
          collect(byFilm, yield* signal.forPerson(round, person))
      if (signal.forFilm) collect(ofFilm, yield* signal.forFilm(round))
    }
    return { byFilm, ofFilm }
  })

/** Satisfação (#176): only in the default Regra and in a group.
 * `adjustment` is factor × how far each Pessoa is below the highest. */
const satisfactionOf = (
  r: Ranking,
): RankEffect<{
  readonly group: GroupSatisfaction | null
  readonly adjustment: ReadonlyMap<string, number>
}> =>
  Effect.gen(function* () {
    const { attendees } = r.options
    const group: GroupSatisfaction | null =
      usesSatisfaction(r.rule) && attendees.length > 1
        ? yield* groupSatisfaction(
            r.db,
            attendees,
            r.weights.satisfaction.window,
          )
        : null
    const factor = r.weights.satisfaction.factor
    const adjustment = new Map(
      factor && group !== null
        ? [...group.behind].map(([p, gap]) => [p, factor * gap])
        : [],
    )
    return { group, adjustment }
  })

/** What the signals read on the films to order. */
interface Signals {
  readonly byFilm: ByFilm
  readonly ofFilm: ByFilm
  readonly adjustment: ReadonlyMap<string, number>
}

const idsToOrder = (r: Ranking, signals: Signals): Iterable<string> => {
  const { selection, regenerate, count } = r.options
  const { candidates } = r.round
  if (
    selection === undefined ||
    signals.adjustment.size > 0 ||
    r.asked.pending.size > 0
  )
    return candidates.keys()
  // With no lookup that could refuse a film after the order, the other
  // guesses never reach the top when there are already `count` more
  // voted ones.
  const popular = selection.popular
    .filter((id) => candidates.has(id))
    .slice(0, count)
  const some = new Set([
    ...signals.byFilm.keys(),
    ...signals.ofFilm.keys(),
    ...popular,
  ])
  if (regenerate !== undefined)
    for (const id of regenerate.positions.keys())
      if (candidates.has(id)) some.add(id)
  return some
}

/** The films by the Regra (`ordered`) and, with a satisfaction
 * adjustment, their keys without it (`unweighed`). */
const orderFilms = (
  r: Ranking,
  signals: Signals,
): {
  readonly ordered: ReadonlyArray<Ordered>
  readonly unweighed: { key: Key; id: string }[]
} => {
  const { weights, rule } = r
  const { byFilm, ofFilm, adjustment } = signals
  const ordered: Ordered[] = []
  const unweighed: { key: Key; id: string }[] = []
  for (const filmId of idsToOrder(r, signals)) {
    const film = r.round.candidates.get(filmId)
    if (film === undefined) throw pythonError('KeyError', `'${filmId}'`)
    const evidence = byFilm.get(filmId) ?? []
    const utilities = new Map(
      r.options.attendees.map((person) => [
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
    const byRule = ruleKey(rule, utilities, adjustment)
    const tier = r.asked.tierOf(filmId)
    ordered.push({
      key: orderKey(byRule, hasFact, film, bonus, tier),
      id: film.id,
      band: bandOf(byRule, hasFact, tier),
      score: (byRule?.[0] ?? 0) + bonus,
      film,
      utilities,
      evidence,
    })
    if (adjustment.size > 0)
      unweighed.push({
        key: orderKey(ruleKey(rule, utilities), hasFact, film, bonus, tier),
        id: filmId,
      })
  }
  ordered.sort(byKey)
  return { ordered, unweighed }
}

/** `key` with `bonus` more on the Regra's score. */
const raisedKey = (key: Key, bonus: number): Key => [
  key[0],
  (key[1] as readonly number[]).map((v) => v - bonus),
  ...key.slice(2),
]

/** The critics' score (#282): the films in the first `on_demand_reach`
 * places ask OMDb, and their lines' bonus reorders them only among
 * themselves; the films past that place are not asked and keep theirs.
 * `unweighed` gets the same bonus, so the satisfaction line compares
 * like with like. */
const withCritics = (
  r: Ranking,
  { ordered, unweighed }: ReturnType<typeof orderFilms>,
  ofFilm: ByFilm,
): RankEffect<{
  readonly ordered: ReadonlyArray<Ordered>
  readonly unweighed: { key: Key; id: string }[]
  readonly ofFilm: ByFilm
}> =>
  Effect.gen(function* () {
    const { weight } = r.weights.critics
    const reach = r.weights.constraints.on_demand_reach
    const lines = new Map(ofFilm)
    const bonus = new Map<string, number>()
    for (const { id } of ordered.slice(0, reach)) {
      const found = yield* criticsLines(id, weight)
      if (found.length === 0) continue
      lines.set(id, [...(ofFilm.get(id) ?? []), ...found])
      bonus.set(id, pySum(found.map((e) => contribution(e, r.weights))))
    }
    const raise = <A extends { key: Key; id: string }>(item: A) => {
      const more = bonus.get(item.id)
      return more ? { ...item, key: raisedKey(item.key, more) } : item
    }
    return {
      ordered: [
        ...ordered
          .slice(0, reach)
          .map((item) => {
            const raised = raise(item)
            return { ...raised, score: item.score + (bonus.get(item.id) ?? 0) }
          })
          .sort(byKey),
        ...ordered.slice(reach),
      ],
      unweighed: unweighed.map(raise),
      ofFilm: lines,
    }
  })

const fill = (r: Ranking, pool: ReadonlyArray<Ordered>, places: number) =>
  r.asked.approve(
    pool,
    places,
    r.weights.constraints.on_demand_reach,
    (item) => item.film,
  )

/** The Regra's places, with MMR over `chosen` (#177). */
const regularFill = (
  r: Ranking,
  pool: ReadonlyArray<Ordered>,
  chosen: ReadonlyArray<Ordered>,
  places: number,
) =>
  Effect.flatMap(diversify(r.db, pool, chosen, places, r.weights), (order) =>
    fill(r, order, places),
  )

/** The Aposta (#178): the films that may be the bet, with each
 * Presente's Nota prevista. */
const betCandidates = (
  r: Ranking,
  ordered: ReadonlyArray<Ordered>,
  betAt: number,
): RankEffect<ReadonlyMap<string, BetCandidate>> =>
  Effect.gen(function* () {
    const betOdds = new Map<string, BetCandidate>()
    if (betAt > 0 && r.options.count >= betAt)
      for (const { film, utilities, evidence } of ordered) {
        if (!hasLittleEvidence(evidence, utilities, r.weights)) continue
        const odds = new Map<string, BetOdds>()
        for (const p of r.options.attendees) {
          const prediction = (yield* predictRatings(r.round, p)).get(film.id)
          if (prediction !== undefined) odds.set(p, prediction)
        }
        if (odds.size > 0) betOdds.set(film.id, { id: film.id, odds })
      }
    return betOdds
  })

interface BetFill {
  readonly regular: ReadonlyArray<Ordered>
  readonly bet: Ordered | undefined
  /** The Histórico de apostas required a higher Nota prevista. */
  readonly cautious: boolean
}

/** The bet among the films the Regra did not take, else one more film
 * of the Regra. */
const drawBet = (
  r: Ranking,
  draw: {
    readonly seed: string
    readonly betOdds: ReadonlyMap<string, BetCandidate>
    readonly policy: ReturnType<typeof betPolicy>
    readonly pool: ReadonlyArray<Ordered>
    readonly candidates: ReadonlyArray<Ordered>
    readonly regular: ReadonlyArray<Ordered>
  },
): RankEffect<BetFill> =>
  Effect.gen(function* () {
    const { seed, betOdds, policy, pool, candidates, regular } = draw
    const { weights } = r
    const taken = new Set(regular.map((item) => item.film.id))
    const byId = new Map(candidates.map((item) => [item.film.id, item]))
    const drawn = drawBets(
      seed,
      candidates
        .filter((item) => !taken.has(item.film.id))
        .flatMap((item) => betOdds.get(item.film.id) ?? []),
      weights.bet.min_predicted,
      policy.floors,
    ).flatMap((id) => byId.get(id) ?? [])
    const [bet] = yield* fill(r, drawn, 1)
    if (bet !== undefined) {
      const cautious = [...policy.floors].some(
        ([p, minimum]) =>
          minimum > weights.bet.min_predicted &&
          betOdds.get(bet.id)?.odds.has(p),
      )
      return { regular, bet, cautious }
    }
    // No bet passed: the place goes back to the Regra.
    const tried = new Set(drawn.map((item) => item.film.id))
    const more = yield* fill(
      r,
      pool.filter(
        (item) => !taken.has(item.film.id) && !tried.has(item.film.id),
      ),
      1,
    )
    return { regular: [...regular, ...more], bet: undefined, cautious: false }
  })

/** The Regra's films for `places` places of `pool`, and the bet for one
 * of them when some film may be it. */
const withBet = (
  r: Ranking,
  betOdds: ReadonlyMap<string, BetCandidate>,
  pool: ReadonlyArray<Ordered>,
  chosen: ReadonlyArray<Ordered>,
  places: number,
): RankEffect<BetFill> =>
  Effect.gen(function* () {
    const { seed } = r.options
    const candidates = pool.filter((item) => betOdds.has(item.film.id))
    const noBet = Effect.map(
      regularFill(r, pool, chosen, places),
      (regular): BetFill => ({ regular, bet: undefined, cautious: false }),
    )
    if (seed === undefined || candidates.length === 0 || places < 1)
      return yield* noBet
    const policy = betPolicy(
      seed,
      r.options.attendees,
      yield* readBetRecord(r.round, r.options.session),
      r.weights.bet,
    )
    if (!policy.offer) return yield* noBet
    const regular = yield* regularFill(r, pool, chosen, places - 1)
    return yield* drawBet(r, {
      seed,
      betOdds,
      policy,
      pool,
      candidates,
      regular,
    })
  })

/** The films in their places, and which one is the bet. */
interface Placement {
  readonly placed: ReadonlyArray<readonly [number, Ordered]>
  readonly betId: string | undefined
  readonly cautiousBet: boolean
}

interface Bets {
  readonly betAt: number
  readonly betOdds: ReadonlyMap<string, BetCandidate>
}

const placeFresh = (
  r: Ranking,
  ordered: ReadonlyArray<Ordered>,
  { betAt, betOdds }: Bets,
): RankEffect<Placement> =>
  Effect.gen(function* () {
    const { count } = r.options
    const { regular, bet, cautious } =
      betAt > 0 && count >= betAt
        ? yield* withBet(r, betOdds, ordered, [], count)
        : {
            regular: yield* regularFill(r, ordered, [], count),
            bet: undefined,
            cautious: false,
          }
    const approved =
      bet === undefined ? regular : regular.toSpliced(betAt - 1, 0, bet)
    return {
      placed: approved.map((item, i) => [i + 1, item] as const),
      betId: bet?.film.id,
      cautiousBet: cautious,
    }
  })

/** The kept films that still pass the on-demand Restrições; the others
 * go to `removed`. */
const keptThatPass = (
  r: Ranking,
  ordered: ReadonlyArray<Ordered>,
  removed: Map<string, RemovalCause>,
): RankEffect<ReadonlyArray<Ordered>> =>
  Effect.gen(function* () {
    const { asked } = r
    const fixed: Ordered[] = []
    for (const item of ordered) {
      if (!r.kept(item.film.id)) continue
      if (yield* asked.passesOnDemand(item.film, true)) fixed.push(item)
      else {
        const by = asked.removedBy.get(item.film.id)
        if (by === undefined) throw pythonError('KeyError', `'${item.film.id}'`)
        removed.set(
          item.film.id,
          byConstraint(by, asked.dropDetails.get(item.film.id)),
        )
      }
    }
    return fixed
  })

const idOf = (item: Ordered) => item.film.id

/** The refazer with the new bet kept at `betAt`. */
const withBetAt = (
  regenerate: Regenerate,
  bet: Ordered,
  betAt: number,
): Regenerate => ({
  ...regenerate,
  positions: new Map([...regenerate.positions, [bet.film.id, betAt]]),
})

const placeRegenerated = (
  r: Ranking,
  regenerate: Regenerate,
  ordered: ReadonlyArray<Ordered>,
  removed: Map<string, RemovalCause>,
  { betAt, betOdds }: Bets,
): RankEffect<Placement> =>
  Effect.gen(function* () {
    const { count } = r.options
    const fixed = yield* keptThatPass(r, ordered, removed)
    const others = ordered.filter((item) => !r.kept(item.film.id))
    const places = Math.max(count - fixed.length, 0)
    // A kept bet stays the bet; else a new one, if its place is free.
    const keptBet = fixed.find((item) => item.film.id === regenerate.bet)
    const canBet =
      betAt > 0 &&
      count >= betAt &&
      fixed.every((item) => regenerate.positions.get(item.film.id) !== betAt)
    const regularPlaces = Effect.map(
      regularFill(r, others, fixed, places),
      (regular) => place(regenerate, fixed, regular, count, idOf),
    )
    if (keptBet !== undefined)
      return {
        placed: yield* regularPlaces,
        betId: keptBet.film.id,
        cautiousBet: regenerate.cautiousBet ?? false,
      }
    if (!canBet)
      return {
        placed: yield* regularPlaces,
        betId: undefined,
        cautiousBet: false,
      }
    const { regular, bet, cautious } = yield* withBet(
      r,
      betOdds,
      others,
      fixed,
      places,
    )
    return {
      placed:
        bet === undefined
          ? place(regenerate, fixed, regular, count, idOf)
          : place(
              withBetAt(regenerate, bet, betAt),
              [...fixed, bet],
              regular,
              count,
              idOf,
            ),
      betId: bet?.film.id,
      cautiousBet: cautious,
    }
  })

const placeFilms = (
  r: Ranking,
  ordered: ReadonlyArray<Ordered>,
  removed: Map<string, RemovalCause>,
): RankEffect<Placement> =>
  Effect.gen(function* () {
    const betAt = r.options.seed === undefined ? 0 : r.weights.bet.position
    const bets = { betAt, betOdds: yield* betCandidates(r, ordered, betAt) }
    const { regenerate } = r.options
    return regenerate !== undefined
      ? yield* placeRegenerated(r, regenerate, ordered, removed, bets)
      : yield* placeFresh(r, ordered, bets)
  })

/** The two orders by the Regra, with and without weighing the
 * satisfaction, over the same films: the ones with the same verdicts,
 * without asking an on-demand source for more answers. MMR does not
 * enter: a film it moved up did not go up by the satisfaction. When
 * regenerating, only the free places compete: each one's order is among
 * the films not kept, and the kept film, there because the Dono asked,
 * gets no satisfaction line. */
const satisfactionPositions = (
  r: Ranking,
  ordered: ReadonlyArray<Ordered>,
  unweighed: { key: Key; id: string }[],
  { placed, betId }: Placement,
) => {
  const approvedIds = new Set(placed.map(([, item]) => item.film.id))
  const competes = (id: string) =>
    (approvedIds.has(id) || !r.asked.pending.get(id)?.length) &&
    !r.kept(id) &&
    id !== betId
  const positionUnweighed = new Map(
    unweighed
      .sort(byKey)
      .filter(({ id }) => competes(id))
      .map(({ id }, i) => [id, i + 1]),
  )
  const contested = new Map(
    ordered
      .filter((item) => competes(item.id))
      .map((item, i) => [item.id, i + 1]),
  )
  return { positionUnweighed, contested }
}

const personNames = (
  db: Connection,
  adjustment: ReadonlyMap<string, number>,
): Effect.Effect<ReadonlyMap<string, string>, SqliteError> =>
  Effect.gen(function* () {
    const names = new Map<string, string>()
    if (adjustment.size > 0)
      for (const row of yield* db.all('SELECT slug, nome FROM pessoas'))
        names.set(text(row, 'slug'), text(row, 'nome'))
    return names
  })

/** What the placed films' lines read, besides the ranking. */
interface Finish {
  readonly ofFilm: ByFilm
  readonly group: GroupSatisfaction | null
  readonly adjustment: ReadonlyMap<string, number>
  readonly contested: ReadonlyMap<string, number>
  readonly positionUnweighed: ReadonlyMap<string, number>
  readonly names: ReadonlyMap<string, string>
  readonly betId: string | undefined
  readonly cautiousBet: boolean
}

const strongestFirst = (weights: Weights) => (a: Evidence, b: Evidence) =>
  compareTuple(
    [-Math.abs(contribution(a, weights)), a.factId ?? ''],
    [-Math.abs(contribution(b, weights)), b.factId ?? ''],
  )

/** The Restrições' lines, the film signals, the satisfaction line and the
 * cautious bet's line. */
const filmLinesOf = (
  r: Ranking,
  finish: Finish,
  { film, utilities }: Ordered,
): ReadonlyArray<Evidence> => {
  const { weights } = r
  const { group, betId } = finish
  // Film signals: the strongest first; on a tie, the order of the
  // Climas asked for.
  const signalLines = [...(finish.ofFilm.get(film.id) ?? [])].sort(
    (a, b) =>
      Math.abs(contribution(b, weights)) - Math.abs(contribution(a, weights)),
  )
  const satisfactionLines =
    group === null || film.id === betId
      ? []
      : wentUpBySatisfaction(
          film.id,
          finish.contested,
          finish.positionUnweighed,
          utilities,
          finish.adjustment,
        ).map((p) => {
          return satisfactionLine(
            p,
            finish.names.get(p) ?? p,
            group,
            scaleOf(r.round, p),
            film.id,
            r.run.today,
          )
        })
  return [
    ...r.asked.linesOf(film.id),
    ...signalLines,
    ...satisfactionLines,
    ...(film.id === betId && finish.cautiousBet
      ? [cautiousBetLine(film.id)]
      : []),
  ]
}

const predictedRatingsOf = (
  round: Round,
  filmId: string,
): RankEffect<ReadonlyArray<[string, PredictedRating]>> =>
  Effect.gen(function* () {
    const predicted: Array<[string, PredictedRating]> = []
    for (const p of round.attendees) {
      const prediction = (yield* predictRatings(round, p)).get(filmId)
      if (prediction !== undefined)
        predicted.push([
          p,
          {
            value: pyRound(prediction.value, 2),
            raw: pyRound(prediction.raw, 2),
            raters: prediction.raters,
            deviation: pyRound(prediction.deviation, 2),
          },
        ])
    }
    return predicted
  })

const recommendedFilm = (
  r: Ranking,
  finish: Finish,
  position: number,
  item: Ordered,
): RankEffect<RecommendedFilm> =>
  Effect.gen(function* () {
    const { weights } = r
    const { attendees, regenerate } = r.options
    const { key, film, utilities, evidence } = item
    const withoutFactOn = [...utilities]
      .filter(([, u]) => u === null)
      .map(([p]) => p)
    const all = [
      ...evidence,
      ...withoutFactOn.map((p) => withoutFact(p, film.id)),
    ].sort(strongestFirst(weights))
    const lines = filmLinesOf(r, finish, item)
    const predicted = yield* predictedRatingsOf(r.round, film.id)
    const isBet = film.id === finish.betId
    return {
      position,
      id: film.id,
      title: film.title,
      year: film.year,
      runtimeMinutes: film.runtimeMinutes,
      ...(yield* filmHeader(r.db, film)),
      coverage: {
        withFact: utilities.size - withoutFactOn.length,
        attendees: utilities.size,
        withoutFact: withoutFactOn,
      },
      onlyGuesses: (key[0] as number) % BANDS === 2,
      utility: Object.fromEntries(
        [...utilities].map(([p, u]) => [p, u === null ? null : pyRound(u, 4)]),
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
      ...(isBet && { bet: true as const }),
      ...(isBet && finish.cautiousBet && { cautiousBet: true as const }),
    }
  })

const recommendation = (
  r: Ranking,
  done: {
    readonly films: ReadonlyArray<RecommendedFilm>
    readonly removed: ReadonlyMap<string, RemovalCause>
    readonly group: GroupSatisfaction | null
    readonly warningsBefore: number
  },
): RankEffect<Recommendation> =>
  Effect.gen(function* () {
    const { films, group } = done
    const { attendees, regenerate } = r.options
    return {
      attendees,
      rule: ruleToJson(r.rule),
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
      vetoes: r.vetoes.acted,
      moods: r.round.moods.map((m) => m.name),
      films,
      constraints: r.asked.toJson(),
      warnings: (yield* r.run.warnings).slice(done.warningsBefore),
      attributions: attributionsOf([
        ...films.flatMap((f) =>
          [f.filmLines, ...Object.values(f.evidence)].flatMap((lines) =>
            lines.map((e) => e.source),
          ),
        ),
        ...films.filter((f) => f.poster || f.titlePt).map(() => 'TMDB'),
      ]),
      ...(regenerate !== undefined && {
        kept: films.filter((f) => r.kept(f.id)).map((f) => f.id),
        dropped: yield* droppedFilms(
          r.db,
          attendees,
          regenerate,
          new Set(films.map((f) => f.id)),
          done.removed,
        ),
      }),
      ...relaxedIn(r, films),
    }
  })

/** The Restrições relaxed to let the placed films in, each with the films
 * whose last relaxed Restrição it is (#358). */
const relaxedIn = (
  r: Ranking,
  films: ReadonlyArray<RecommendedFilm>,
): { readonly relaxed?: ReadonlyArray<RelaxedConstraint> } => {
  const by = new Map<Constraint, Candidate[]>()
  for (const { id } of films) {
    const last = r.asked
      .relaxedOf(id)
      .toSorted(
        (a, b) => RELAX_ORDER.indexOf(a.name) - RELAX_ORDER.indexOf(b.name),
      )
      .at(-1)
    const film = r.round.candidates.get(id)
    if (last !== undefined && film !== undefined)
      by.set(last, [...(by.get(last) ?? []), film])
  }
  const relaxed = [...by]
    .toSorted(
      ([a], [b]) => RELAX_ORDER.indexOf(a.name) - RELAX_ORDER.indexOf(b.name),
    )
    .map(([c, came]) => ({
      constraint: c.name,
      films: came.length,
      text: c.relaxedText?.(came) ?? '',
    }))
  return relaxed.length > 0 ? { relaxed } : {}
}

/** The recommendation for Presentes already resolved, on an open read
 * connection (Python's `recomendar(conn, ...)`). Warnings go to the
 * request's `Run`; the result carries the ones this call added. */
export const rank = (
  db: Connection,
  options: RankOptions,
): RankEffect<Recommendation> =>
  Effect.gen(function* () {
    const run = yield* Run
    const warningsBefore = (yield* run.warnings).length
    const r = yield* prepare(db, options)
    const removed = yield* keptRemovals(r)
    const signals = yield* signalEvidence(r.round)
    const { group, adjustment } = yield* satisfactionOf(r)
    const { ordered, unweighed, ofFilm } = yield* withCritics(
      r,
      orderFilms(r, { ...signals, adjustment }),
      signals.ofFilm,
    )
    const placement = yield* placeFilms(r, ordered, removed)
    const finish: Finish = {
      ofFilm,
      group,
      adjustment,
      ...satisfactionPositions(r, ordered, unweighed, placement),
      names: yield* personNames(db, adjustment),
      betId: placement.betId,
      cautiousBet: placement.cautiousBet,
    }
    const films: RecommendedFilm[] = []
    for (const [position, item] of placement.placed)
      films.push(yield* recommendedFilm(r, finish, position, item))
    for (const warning of r.asked.listWarnings(films.length, options.count))
      yield* run.warn(warning)
    if (options.regenerate !== undefined)
      for (const [filmId, cause] of removed)
        yield* run.warn(keptWarning(options.regenerate, filmId, cause))
    return yield* recommendation(r, { films, removed, group, warningsBefore })
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
  /** The Aposta's draws (#178); a Session gives its id. Without it, no
   * bet. */
  readonly seed?: string
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
 * the Presentes resolved, the Regra checked, then `rank`. `seedOf` gives
 * the Aposta's seed from the Presentes when the request has none. */
export const rankRequest = (
  request: RecommendRequest & Pick<RankOptions, 'refillMoods' | 'relax'>,
  count: number,
  asked: ReadonlyArray<Constraint>,
  regenerate?: Regenerate,
  seedOf?: (
    db: Connection,
    attendees: ReadonlyArray<string>,
  ) => Effect.Effect<string, EngineError | SqliteError, EngineServices | Run>,
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
        const seed =
          request.seed ??
          (seedOf === undefined ? undefined : yield* seedOf(db, attendees))
        return yield* rank(db, {
          attendees,
          count,
          rule,
          constraints: asked,
          moods: request.moods ?? [],
          ...(request.refillMoods !== undefined && {
            refillMoods: request.refillMoods,
          }),
          ...(request.relax && { relax: true }),
          ...(regenerate !== undefined && { regenerate }),
          ...(seed !== undefined && { seed }),
          ...(request.session != null && { session: request.session }),
        })
      }),
    )
  })

/** `recommend`, with the Restrições it applied: the same values, so what
 * they learnt while evaluating (the similar's reference titles) reaches
 * the Session (Python's `_contexto` reads them after `recomendar`). */
const recommendAsked = (
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
