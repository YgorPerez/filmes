// An on-demand source: the cache first, then the API, and a warning instead
// of a failure (`filmes/sob_demanda/fonte.py`). OMDb, Does the Dog Die and
// TMDB each say how to ask their API; the rules they share are here:
//
// - The API key comes from an environment variable. Without it the source
//   warns once and answers nothing; the Recommendation goes on without it.
// - A transient failure (connection refused or dropped, timeout, HTTP 429
//   or 5xx) is tried again, up to `TRIES` times, 2 s and then 4 s apart. If
//   it persists, or for any other failure, the source warns once and stays
//   off until the request ends, so it does not wait for the timeout on
//   every film.
// - What the API answered, "not found" included, goes to the cache with
//   the source's validity. A failure does not.
// - With `FILMES_GRAVACOES=<dir>` the "network" is `<dir>/<folder>/<key>.json`
//   and a missing file is "not found": tests and the oracle run without the
//   network. A network failure is recorded as `<key>.falha.json`,
//   `{"motivo": "...", "vezes": N}`: it fails the first N times in the
//   request and then reads `<key>.json`; without `vezes` it always fails.

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  Context,
  Effect,
  Layer,
  Redacted,
  Result,
  Schedule,
  Schema,
} from 'effect'
import { Environment, type SourceKeyVariable } from '../runtime/Environment.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import { Run } from '../runtime/Run.ts'
import type { SqliteError } from '../sqlite/Sqlite.ts'
import { SourceCache, type CachedAnswer } from './SourceCache.ts'

/** Seconds per HTTP request. */
const TIMEOUT = '10 seconds'
/** Tries for a transient failure. */
const TRIES = 3
/** The pause before the second try; it doubles for each one after. */
const PAUSE = '2 seconds'

/** The source did not answer as it should: the network, a refused key, a
 * usage limit. Only a transient one is tried again. */
export class SourceFailure extends Schema.TaggedError<
  SourceFailure,
  { readonly brand: unique symbol }
>()('SourceFailure', {
  /** Shown in the warning: "HTTP 503", "Request limit reached!". */
  reason: Schema.String,
  transient: Schema.Boolean,
}) {}

/** What the shared rules need to know about a source. */
export interface SourceProfile {
  /** As Evidence and warnings name it: "OMDb". */
  readonly name: string
  /** The cache's `fonte` and the recordings' folder: "omdb". */
  readonly folder: string
  /** Its state in the request (off, recorded failures). Two profiles of one
   * API (the TMDB of the import and the TMDB of the posters) share the
   * folder, not this. */
  readonly id: string
  readonly keyVariable: SourceKeyVariable
  readonly validityDays: number
  /** What happens without it, for the warning. */
  readonly withoutIt: string
  /** The body that stands for "not found". */
  readonly notFound: unknown
}

/** How a source's request reaches an answer: the API, or the recordings. */
export class Transport extends Context.Service<
  Transport,
  {
    /** The answer for `key`, with transient failures tried again. `live`
     * asks the API once. */
    readonly answer: (
      profile: SourceProfile,
      key: string,
      live: Effect.Effect<unknown, SourceFailure>,
    ) => Effect.Effect<unknown, SourceFailure, Run>
  }
>()('@filmes/engine/sources/Transport') {
  /** The network, with the 2 s and 4 s pauses between tries. */
  static readonly live: Layer.Layer<Transport> = Layer.succeed(
    Transport,
    Transport.of({
      answer: (_profile, _key, live) =>
        Effect.retry(live, {
          schedule: Schedule.exponential(PAUSE),
          times: TRIES - 1,
          while: (failure) => failure.transient,
        }),
    }),
  )

  /** The files under `dir`, tried again without pausing. */
  static readonly recorded = (dir: string): Layer.Layer<Transport> =>
    Layer.succeed(
      Transport,
      Transport.of({
        answer: (profile, key) =>
          Effect.retry(readRecording(dir, profile, key), {
            times: TRIES - 1,
            while: (failure) => failure.transient,
          }),
      }),
    )

  /** The recordings when `FILMES_GRAVACOES` is set, the network otherwise. */
  static readonly layer: Layer.Layer<Transport, never, Environment> =
    Layer.unwrap(
      Effect.gen(function* () {
        const { paths } = yield* Environment
        return paths.recordings === undefined
          ? Transport.live
          : Transport.recorded(paths.recordings)
      }),
    )
}

const RecordedFailure = Schema.Struct({
  motivo: Schema.Unknown,
  vezes: Schema.optionalKey(Schema.Int),
})

const readJson = (path: string): unknown =>
  JSON.parse(readFileSync(path, 'utf8'))

const readRecording = (
  dir: string,
  profile: SourceProfile,
  key: string,
): Effect.Effect<unknown, SourceFailure, Run> =>
  Effect.gen(function* () {
    const failurePath = join(dir, profile.folder, `${key}.falha.json`)
    if (existsSync(failurePath)) {
      // A broken recording is a defect, as Python's KeyError was.
      const recorded = yield* Schema.decodeUnknownEffect(RecordedFailure)(
        readJson(failurePath),
      ).pipe(Effect.orDie)
      // Counting past `vezes` changes nothing: it only fails below it.
      const before = yield* (yield* Run).countRecordedFailure(profile.id, key)
      if (recorded.vezes === undefined || before < recorded.vezes)
        return yield* new SourceFailure({
          reason: String(recorded.motivo),
          transient: true,
        })
    }
    const path = join(dir, profile.folder, `${key}.json`)
    return existsSync(path) ? readJson(path) : profile.notFound
  })

/** The `fetch` the sources call: the global one, unless an effect provides
 * another (tests do, so no test reaches the network). Plain `fetch`, not
 * `effect/http`'s HttpClient: that module is flagged unstable, and the lint
 * denies the warning. */
export const Fetch = Context.Reference<typeof globalThis.fetch>(
  '@filmes/engine/sources/Fetch',
  { defaultValue: () => globalThis.fetch },
)

const transient = (reason: string) =>
  new SourceFailure({ reason, transient: true })

/** What failed on the way: the deepest cause's message ("connect
 * ECONNREFUSED ..."), as Python shows the `URLError`'s reason. */
const networkReason = (error: unknown): string => {
  let message = String(error)
  let cause = error
  while (cause instanceof Error) {
    message = cause.message
    cause = cause.cause
  }
  return message
}

/** A GET for JSON: the body, `null` for a 404, and a `SourceFailure` for the
 * rest (Python's `pegar_json`), within `TIMEOUT`. */
export const getJson = (
  url: string,
  headers: Readonly<Record<string, string>> = {},
): Effect.Effect<unknown, SourceFailure> =>
  Effect.gen(function* () {
    const fetch = yield* Fetch
    const response = yield* Effect.tryPromise({
      try: (signal) =>
        fetch(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'filmes',
            ...headers,
          },
          signal,
        }),
      catch: (error) => transient(networkReason(error)),
    })
    if (response.status === 404) return null
    if (response.status >= 400)
      return yield* new SourceFailure({
        reason: `HTTP ${response.status}`,
        transient: response.status === 429 || response.status >= 500,
      })
    const body = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (error) => transient(networkReason(error)),
    })
    return yield* Effect.try({
      try: (): unknown => JSON.parse(body),
      catch: () =>
        new SourceFailure({ reason: 'resposta não é JSON', transient: false }),
    })
  }).pipe(
    Effect.timeoutOrElse({
      duration: TIMEOUT,
      orElse: () => Effect.fail(transient('timed out')),
    }),
  )

/** Asks a source for `key`: the cache, then (with the key, unless the
 * source is off in this request) the transport. `live` gets the API key.
 * `undefined` when there is no answer: no key, or the source failed. */
export type Obtain = (
  profile: SourceProfile,
  key: string,
  live: (apiKey: string) => Effect.Effect<unknown, SourceFailure>,
) => Effect.Effect<CachedAnswer | undefined, EngineError | SqliteError, Run>

export const makeObtain: Effect.Effect<
  Obtain,
  never,
  Environment | SourceCache | Transport
> = Effect.gen(function* () {
  const { sourceKeys } = yield* Environment
  const cache = yield* SourceCache
  const transport = yield* Transport

  return (profile, key, live) =>
    Effect.gen(function* () {
      const run = yield* Run
      const cached = yield* cache.read(profile.folder, key, run.today)
      if (cached !== undefined || (yield* run.isSourceDisabled(profile.id)))
        return cached
      const disable = (warning: string) =>
        Effect.andThen(run.disableSource(profile.id), run.warn(warning))

      const apiKey = sourceKeys[profile.keyVariable]
      if (apiKey === undefined) {
        yield* disable(
          `${profile.name} sem chave de API (defina ${profile.keyVariable}); ${profile.withoutIt}`,
        )
        return undefined
      }
      const answer = yield* Effect.result(
        transport.answer(profile, key, live(Redacted.value(apiKey))),
      )
      if (Result.isFailure(answer)) {
        yield* disable(
          `${profile.name} não respondeu (${answer.failure.reason}); ${profile.withoutIt}`,
        )
        return undefined
      }
      return yield* cache.write(
        profile.folder,
        key,
        answer.success,
        run.today,
        profile.validityDays,
      )
    })
})
