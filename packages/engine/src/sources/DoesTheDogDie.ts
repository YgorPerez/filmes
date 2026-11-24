// Does the Dog Die: yes and no votes per content topic ("a dog dies"), for
// the trigger Restrição (`filmes/sob_demanda/ddd.py`). Cached for 30 days;
// the key is FILMES_DDD_CHAVE.
//
// The terms forbid downloading the base and ask for "Powered by
// DoesTheDogDie.com" on every screen that shows the data: only a film that
// would reach the top 50 is looked up, and the topic's text is quoted as it
// came.
//
// The lookup is by IMDb id; the cached answer is the film's page (`item` and
// `topicItemStats`), in the site's old public API format.

import { Context, Effect, Layer } from 'effect'
import { casefold, pyStrip } from '../compat/index.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import type { Run } from '../runtime/Run.ts'
import type { SqliteError } from '../sqlite/Sqlite.ts'
import { field, list, truthy } from './json.ts'
import {
  getJson,
  makeObtain,
  type SourceProfile,
  type Transport,
} from './Source.ts'
import type { SourceCache } from './SourceCache.ts'

export const DDD_NAME = 'Does the Dog Die'
export const DDD_ATTRIBUTION = 'Powered by DoesTheDogDie.com'
const URL = 'https://www.doesthedogdie.com'

const PROFILE: SourceProfile = {
  name: DDD_NAME,
  folder: 'ddd',
  id: 'ddd',
  keyVariable: 'FILMES_DDD_CHAVE',
  validityDays: 30,
  withoutIt: 'o gatilho fica sem informação e nenhum filme sai por ele',
  notFound: {},
}

/** One topic's votes for a film. */
export interface Topic {
  /** As Does the Dog Die writes it: "a dog dies". */
  readonly name: string
  readonly yes: number
  readonly no: number
}

/** The topics Does the Dog Die has for a film. */
export interface Topics {
  /** By name, question ("Does the dog die") or id, stripped and casefolded;
   * the first topic wins a shared key. */
  readonly byKey: ReadonlyMap<string, Topic>
  /** The day it was fetched. */
  readonly date: string
  readonly factId: string
}

/** The topic asked for by name, question or id, in any case. */
export const findTopic = (topics: Topics, request: string): Topic | undefined =>
  topics.byKey.get(casefold(pyStrip(request)))

/** Python's `int()` of a vote count. */
const count = (value: unknown): number =>
  truthy(value) ? Math.trunc(Number(value)) : 0

export class DoesTheDogDie extends Context.Service<
  DoesTheDogDie,
  {
    /** The film's topics, or `undefined` with no answer. */
    readonly topics: (
      imdbId: string,
    ) => Effect.Effect<Topics | undefined, EngineError | SqliteError, Run>
  }
>()('@filmes/engine/sources/DoesTheDogDie') {
  static readonly layer: Layer.Layer<
    DoesTheDogDie,
    never,
    Environment | SourceCache | Transport
  > = Layer.effect(
    DoesTheDogDie,
    Effect.gen(function* () {
      const obtain = yield* makeObtain

      const live = (imdbId: string) => (apiKey: string) =>
        Effect.gen(function* () {
          const headers = { 'X-API-KEY': apiKey }
          const search = yield* getJson(
            `${URL}/dddsearch?${new URLSearchParams({ imdb: imdbId })}`,
            headers,
          )
          const [first] = list(field(search, 'items'))
          if (first === undefined) return PROFILE.notFound
          const page = yield* getJson(
            `${URL}/media/${String(field(first, 'id'))}`,
            headers,
          )
          return truthy(page) ? page : PROFILE.notFound
        })

      return DoesTheDogDie.of({
        topics: (imdbId) =>
          Effect.map(obtain(PROFILE, imdbId, live(imdbId)), (answer) => {
            const stats = list(field(answer?.body, 'topicItemStats'))
            if (answer === undefined || stats.length === 0) return undefined
            const byKey = new Map<string, Topic>()
            for (const stat of stats) {
              const topic = field(stat, 'topic')
              const name = field(topic, 'name')
              if (!truthy(name)) continue
              const found: Topic = {
                name: String(name),
                yes: count(field(stat, 'yesSum')),
                no: count(field(stat, 'noSum')),
              }
              for (const key of [
                name,
                field(topic, 'doesName'),
                field(topic, 'id'),
              ])
                if (typeof key === 'string' || typeof key === 'number') {
                  const folded = casefold(pyStrip(String(key)))
                  if (!byKey.has(folded)) byKey.set(folded, found)
                }
            }
            return {
              byKey,
              date: answer.fetchedOn,
              factId: `${PROFILE.folder}:${imdbId}`,
            }
          }),
      })
    }),
  )
}
