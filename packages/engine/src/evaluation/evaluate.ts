// `avaliar` (`avaliacao/__init__.py`): measures the Recommendation offline
// and reads the Feedback of the latest Sessions, then writes a dated report.
//
// Everything is read on one read-only connection inside one transaction, so
// the Feedback, the diaries and the cut see the same database. The TEMP
// tables and views of the cut live and die with that connection: nothing is
// written to the database, and no Session is opened.

import { join } from 'node:path'
import { Clock, Effect } from 'effect'
import { compareTuple } from '../compat/compare.ts'
import { prepareSelection } from '../recommendation/candidates.ts'
import { Environment } from '../runtime/Environment.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import type { EngineServices } from '../runtime/Engine.ts'
import { Run } from '../runtime/Run.ts'
import type { Weights } from '../runtime/Weights.ts'
import { sessionOrder } from '../sessions/order.ts'
import { Sqlite, type Connection, type SqliteError } from '../sqlite/Sqlite.ts'
import { num, numOrNull, text, textOrNull } from '../sqlite/row.ts'
import {
  best,
  combinations,
  gridSpace,
  sameWeights,
  type GridEntry,
  type GridSpace,
  type OfflineResult,
} from './grid.ts'
import {
  prepareSample,
  readSample,
  SAMPLE_SIZE,
  SEED,
  type Progress,
} from './movielens.ts'
import { measure, prepareOffline } from './offline.ts'
import { measuredPeople, type MeasuredPerson } from './people.ts'
import { dataVersions, writeReport } from './report.ts'
import type { ReportValue } from './yaml.ts'

/** A progress event, as `avaliar --progresso` wrote it on stderr (EN keys
 * of key-migration's `progress` table). */
export interface EvaluationProgress {
  readonly progress: number
  readonly total: 100
  readonly message: string
}

export interface EvaluateRequest {
  /** Also tries the weight grid (`--grade`). */
  readonly grid?: boolean
  /** Called with each progress event (`--progresso`; the MCP's progress
   * notifications). */
  readonly onProgress?: (event: EvaluationProgress) => Effect.Effect<void>
}

/** The Feedback of the latest Sessions (`online`). */
export interface OnlineMeasures {
  readonly sessions: number
  readonly withFilm: number
  readonly chosenTop5: number
  readonly rateTop5: number | null
  readonly reactions: number
  readonly meanReaction: number | null
}

/** `avaliar`'s result, with the EN keys of key-migration's `evaluate`
 * table. */
export interface Evaluation {
  readonly date: string
  readonly offline: OfflineResult
  readonly online: OnlineMeasures
  readonly priority: 'online' | 'offline'
  /** The weights as configured (camelCase keys, as the output echoes
   * them). */
  readonly weights: ReportValue
  readonly versions: Readonly<Record<string, unknown>>
  readonly warnings: ReadonlyArray<string>
  readonly movielensSample: { readonly seed: number; readonly users: number }
  readonly grid?: {
    readonly values: ReportValue
    readonly combinations: number
    readonly best: ReportValue
  }
  readonly file: string
}

/** Sessions in the online window. */
const WINDOW = 10

const camelCase = (name: string) =>
  name.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())

/** A value with every key camelCased, as the output gives config keys. */
const camelKeys = (value: unknown): ReportValue => {
  if (Array.isArray(value)) return value.map(camelKeys)
  if (typeof value === 'object' && value !== null)
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [camelCase(k), camelKeys(v)]),
    )
  return value as ReportValue
}

/** The grid's sections keep their flat names (`path.weight`); the keys
 * inside are camelCased. */
const gridSections = (
  sections: Readonly<Record<string, unknown>>,
): ReportValue =>
  Object.fromEntries(
    Object.entries(sections).map(([name, keys]) => [name, camelKeys(keys)]),
  )

const spaceToJson = (space: GridSpace): ReportValue =>
  gridSections(
    Object.fromEntries(
      Object.entries(space).map(([section, values]) => [
        section,
        Object.fromEntries(values),
      ]),
    ),
  )

const entryToJson = (entry: GridEntry): ReportValue => ({
  weights: gridSections(entry.weights),
  recall50: entry.recall50,
  coverageTop5: entry.coverageTop5,
  offline: entry.offline as unknown as ReportValue,
})

/** `_online`: the 10 latest Sessions with Feedback. "Não vimos nada" stays
 * in the window of 10 but out of the rate's denominator. */
const online = (db: Connection): Effect.Effect<OnlineMeasures, SqliteError> =>
  Effect.gen(function* () {
    const rows = (yield* db.all(`
      SELECT id, data, escolhido, escolhido_na_recomendacao FROM sessoes WHERE feedback_em IS NOT NULL
      ORDER BY id
    `)).map((row) => ({
      id: text(row, 'id'),
      date: text(row, 'data'),
      chosen: textOrNull(row, 'escolhido'),
      chosenPosition: numOrNull(row, 'escolhido_na_recomendacao'),
    }))
    // `sorted(..., key=ordem, reverse=True)`: stable, so equal keys keep
    // their order.
    const sessions = rows
      .map((row) => ({ row, key: sessionOrder(row) }))
      .sort((a, b) => compareTuple([...b.key], [...a.key]))
      .slice(0, WINDOW)
      .map(({ row }) => row)
    const withFilm = sessions.filter((s) => s.chosen !== null).length
    const chosenTop5 = sessions.filter(
      (s) => 1 <= (s.chosenPosition ?? 0) && (s.chosenPosition ?? 0) <= 5,
    ).length
    const reactions = yield* db.get(
      `SELECT avg(valor) AS media, count(*) AS reacoes FROM reacoes WHERE sessao IN (${sessions.map(() => '?').join(',')})`,
      ...sessions.map((s) => s.id),
    )
    return {
      sessions: sessions.length,
      withFilm,
      chosenTop5,
      rateTop5: withFilm ? chosenTop5 / withFilm : null,
      reactions: num(reactions!, 'reacoes'),
      meanReaction: numOrNull(reactions!, 'media'),
    }
  })

const MEASURE_FROM = 35
const MEASURE_SPAN = 60
const NOTIFY_EVERY_MS = 5_000

/** `_medir`: the current weights, then (with the grid) every combination. */
const measureAll = (
  db: Connection,
  weights: Weights,
  people: ReadonlyArray<MeasuredPerson>,
  sample: ReadonlyArray<MeasuredPerson>,
  withGrid: boolean,
  progress: Progress,
): Effect.Effect<
  { readonly current: OfflineResult; readonly grid: Evaluation['grid'] | null },
  EngineError | SqliteError,
  EngineServices | Run
> =>
  Effect.gen(function* () {
    const count = people.length + sample.length
    const selection = yield* prepareSelection(db, weights)
    const space = withGrid ? gridSpace(weights) : null
    const configs = space && count ? combinations(weights, space) : []
    const total =
      count * (1 + configs.filter((c) => !sameWeights(c, weights)).length)
    let done = 0
    let percent = MEASURE_FROM
    let lastNotice = yield* Clock.currentTimeMillis
    let message = 'Medindo recall e cobertura'
    yield* progress(percent, message)

    const advance = Effect.gen(function* () {
      done += 1
      const now = MEASURE_FROM + (MEASURE_SPAN * done) / total
      const clock = yield* Clock.currentTimeMillis
      if (
        Math.trunc(now) > Math.trunc(percent) ||
        clock - lastNotice >= NOTIFY_EVERY_MS
      ) {
        percent = now
        lastNotice = clock
        yield* progress(now, message)
      }
    })

    const measureWith = (config: Weights) =>
      Effect.gen(function* () {
        return {
          people: yield* measure(db, config, people, selection, advance),
          movielens: yield* measure(db, config, sample, selection, advance),
        }
      })

    const current = yield* measureWith(weights)
    if (!withGrid || space === null) return { current, grid: null }
    message = 'Comparando os pesos da grade'
    const results: Array<readonly [Weights, OfflineResult]> = []
    for (const config of configs)
      results.push([
        config,
        sameWeights(config, weights) ? current : yield* measureWith(config),
      ])
    return {
      current,
      grid: {
        values: spaceToJson(space),
        combinations: configs.length,
        best: best(weights, results).map(entryToJson),
      },
    }
  })

/** `avaliar`. */
export const evaluate = (
  request: EvaluateRequest = {},
): Effect.Effect<Evaluation, EngineError | SqliteError, EngineServices | Run> =>
  Effect.gen(function* () {
    const env = yield* Environment
    const sqlite = yield* Sqlite
    const run = yield* Run
    const progress: Progress = (value, message) =>
      request.onProgress
        ? request.onProgress({ progress: value, total: 100, message })
        : Effect.void
    yield* progress(0, 'Lendo o Feedback e os diários')
    const catalog = yield* env.path('catalog')
    const manifest = yield* env.path('versions')
    const movielensFolder = join(catalog, 'ml-32m')
    const measured = yield* sqlite.read((db) =>
      Effect.gen(function* () {
        yield* db.exec('BEGIN')
        const onlineMeasures = yield* online(db)
        const people = yield* measuredPeople(db, run.today)
        yield* progress(10, 'Sorteando a amostra do MovieLens')
        const sample = yield* readSample(movielensFolder, manifest, progress)
        const sampled = sample?.measured ?? []
        yield* prepareOffline(db, people, sampled)
        if (sample) {
          yield* progress(20, 'Calculando vizinhos sem os usuários sorteados')
          yield* prepareSample(db, movielensFolder, sample, progress)
        }
        const result = yield* measureAll(
          db,
          env.weights,
          people,
          sampled,
          request.grid ?? false,
          progress,
        )
        return { onlineMeasures, sample, ...result }
      }),
    )
    const { onlineMeasures, sample, current, grid } = measured

    const warnings: string[] = []
    if (sample === null)
      warnings.push(
        'A amostra offline do MovieLens exige ml-32m/ratings.csv e ml-32m/links.csv no Catálogo.',
      )
    else if (sample.users.size < SAMPLE_SIZE)
      warnings.push(
        `O MovieLens tinha só ${sample.users.size} usuários para sortear.`,
      )

    yield* progress(96, 'Gravando o relatório')
    const result = {
      date: run.today,
      offline: current,
      online: onlineMeasures,
      priority:
        onlineMeasures.sessions >= WINDOW
          ? ('online' as const)
          : ('offline' as const),
      weights: camelKeys(env.weights),
      versions: dataVersions(catalog, manifest),
      warnings,
      movielensSample: { seed: SEED, users: sample ? sample.users.size : 0 },
      ...(grid ? { grid } : {}),
    }
    const folder = yield* env.path('evaluations')
    const file = yield* Effect.sync(() =>
      writeReport(folder, {
        ...result,
        versions: result.versions as ReportValue,
        offline: current,
        ...(grid
          ? { grid: { combinations: grid.combinations, best: grid.best } }
          : {}),
      }),
    )
    yield* progress(100, 'Relatório gravado')
    return { ...result, file }
  })
