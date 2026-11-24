// TMDB (`filmes/sob_demanda/tmdb.py`): the film search by title and year,
// for what Wikidata did not resolve in the Letterboxd import, and the card
// (poster, Portuguese title, synopsis) of the Recommendation's films.
// Cached for 6 months; the key is FILMES_TMDB_CHAVE (the v3 key, sent as
// `api_key`, or the v4 read token, sent in the header).
//
// Five requests, each one cache entry and one recording file:
//
//     filme-<slug>-<year>-<hash>   GET /search/movie?query=<title>&primary_release_year=<year>
//     serie-<slug>-<year>-<hash>   GET /search/tv?query=<title>&first_air_date_year=<year>
//     externos-<id>                GET /movie/<id>/external_ids, for the imdb_id
//     detalhes-<id>                GET /movie/<id>, for the runtime of candidates with few votes
//     find-<tconst>-pt-BR          GET /find/<tconst>?external_source=imdb_id&language=pt-BR,
//                                  for the poster, the Portuguese title and the synopsis
//
// The search takes the title as the export gave it; the hash tells apart
// titles with the same slug. The import and the card are two profiles of the
// one API, as in the Python (`TMDB` and `CapasTMDB`): each is switched off
// on its own and warns with its own consequence. TMDB's terms ask for
// `TMDB_ATTRIBUTION` wherever its data shows.

import { createHash } from 'node:crypto'
import { Context, Effect, Layer } from 'effect'
import { letterboxdSlug, pyStrip } from '../compat/index.ts'
import type { EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import { Run } from '../runtime/Run.ts'
import type { SqliteError } from '../sqlite/Sqlite.ts'
import { field, list, text, truthy } from './json.ts'
import {
  getJson,
  makeObtain,
  type SourceProfile,
  type Transport,
} from './Source.ts'
import { SourceCache, type CachedAnswer } from './SourceCache.ts'

export const TMDB_NAME = 'TMDB'
export const TMDB_ATTRIBUTION = {
  source: TMDB_NAME,
  text: 'This product uses the TMDB API but is not endorsed or certified by TMDB.',
} as const

const URL = 'https://api.themoviedb.org/3'
const IMAGES = 'https://image.tmdb.org/t/p/w185'

const SEARCH: SourceProfile = {
  name: TMDB_NAME,
  folder: 'tmdb',
  id: 'tmdb',
  keyVariable: 'FILMES_TMDB_CHAVE',
  validityDays: 182,
  withoutIt:
    'o que o Wikidata não resolveu fica na fila; `fila reprocessar` consulta o TMDB de novo',
  notFound: { results: [] },
}

const POSTERS: SourceProfile = {
  ...SEARCH,
  id: 'tmdb-posters',
  withoutIt: 'os filmes saem sem capa, sem título em português e sem sinopse',
}

/** The cache key of a search. */
const searchKey = (kind: 'filme' | 'serie', title: string, year: number) => {
  const hash = createHash('sha256').update(title, 'utf8').digest('hex')
  return `${kind}-${letterboxdSlug(title).slice(0, 80)}-${year}-${hash.slice(0, 12)}`
}

const TMDB_ID = /^[0-9]+$/
const TCONST = /^tt[0-9]+$/

/** What the card shows of a film; each one `null` with no answer, no film
 * or no value. */
export interface Card {
  /** The poster's URL, at w185. */
  readonly poster: string | null
  readonly titlePt: string | null
  readonly overview: string | null
}

type SourceError = EngineError | SqliteError

export class Tmdb extends Context.Service<
  Tmdb,
  {
    /** The film search's results; `undefined` when TMDB is out. */
    readonly movies: (
      title: string,
      year: number,
    ) => Effect.Effect<ReadonlyArray<unknown> | undefined, SourceError, Run>
    readonly series: (
      title: string,
      year: number,
    ) => Effect.Effect<ReadonlyArray<unknown> | undefined, SourceError, Run>
    /** The film search's results if an earlier request cached them; never
     * asks TMDB nor creates the cache. */
    readonly cachedMovies: (
      title: string,
      year: number,
    ) => Effect.Effect<ReadonlyArray<unknown> | undefined, SourceError, Run>
    /** The film's tconst, from its TMDB id. */
    readonly imdbId: (
      tmdbId: string | number,
    ) => Effect.Effect<string | undefined, SourceError, Run>
    /** The runtime in minutes; `undefined` with no answer or no value. */
    readonly runtime: (
      tmdbId: string | number,
    ) => Effect.Effect<number | undefined, SourceError, Run>
    /** Whether the search went off in this request (the import tells "no
     * answer" from "not found" by it). */
    readonly searchDisabled: Effect.Effect<boolean, never, Run>
    /** Poster, Portuguese title and overview, from one pt-BR lookup. */
    readonly card: (tconst: string) => Effect.Effect<Card, SourceError, Run>
  }
>()('@filmes/engine/sources/Tmdb') {
  static readonly layer: Layer.Layer<
    Tmdb,
    never,
    Environment | SourceCache | Transport
  > = Layer.effect(
    Tmdb,
    Effect.gen(function* () {
      const obtain = yield* makeObtain
      const cache = yield* SourceCache

      /** One request: the first page, and for a search every other page
       * into the same entry. */
      const live =
        (path: string, params: Readonly<Record<string, string>>) =>
        (apiKey: string) =>
          Effect.gen(function* () {
            const query = new URLSearchParams(params)
            const headers: Record<string, string> = {}
            if (apiKey.length > 40)
              headers['Authorization'] = `Bearer ${apiKey}`
            else query.append('api_key', apiKey)
            const body = yield* getJson(`${URL}${path}?${query}`, headers)
            if (body === null) return SEARCH.notFound
            if (!path.startsWith('/search/')) return body
            const results = [...list(field(body, 'results'))]
            const pages = Number(field(body, 'total_pages') ?? 1)
            for (let page = 2; page <= pages; page++) {
              const next = new URLSearchParams(query)
              next.append('page', String(page))
              const answer = yield* getJson(`${URL}${path}?${next}`, headers)
              if (truthy(answer))
                results.push(...list(field(answer, 'results')))
            }
            return { ...(body as object), results }
          })

      const ask = (
        profile: SourceProfile,
        key: string,
        path: string,
        params: Readonly<Record<string, string>> = {},
      ) => obtain(profile, key, live(path, params))

      const results = (answer: CachedAnswer | undefined) =>
        answer === undefined ? undefined : list(field(answer.body, 'results'))

      const search =
        (kind: 'filme' | 'serie', path: string, yearParam: string) =>
        (title: string, year: number) =>
          Effect.map(
            ask(SEARCH, searchKey(kind, title, year), path, {
              query: title,
              [yearParam]: String(year),
              include_adult: 'false',
            }),
            results,
          )

      return Tmdb.of({
        movies: search('filme', '/search/movie', 'primary_release_year'),
        series: search('serie', '/search/tv', 'first_air_date_year'),
        cachedMovies: (title, year) =>
          Effect.gen(function* () {
            const { today } = yield* Run
            const key = searchKey('filme', title, year)
            return results(yield* cache.peek(SEARCH.folder, key, today))
          }),
        imdbId: (tmdbId) => {
          const id = String(tmdbId)
          if (!TMDB_ID.test(id)) return Effect.undefined
          return Effect.map(
            ask(SEARCH, `externos-${id}`, `/movie/${id}/external_ids`),
            (answer) => {
              const imdb = text(field(answer?.body, 'imdb_id'))
              return TCONST.test(imdb) ? imdb : undefined
            },
          )
        },
        runtime: (tmdbId) => {
          const id = String(tmdbId)
          if (!TMDB_ID.test(id)) return Effect.undefined
          return Effect.map(
            ask(SEARCH, `detalhes-${id}`, `/movie/${id}`),
            (answer) => {
              const minutes = field(answer?.body, 'runtime')
              return truthy(minutes) ? Number(minutes) : undefined
            },
          )
        },
        searchDisabled: Effect.gen(function* () {
          return yield* (yield* Run).isSourceDisabled(SEARCH.id)
        }),
        card: (tconst) =>
          Effect.map(
            TCONST.test(tconst)
              ? ask(POSTERS, `find-${tconst}-pt-BR`, `/find/${tconst}`, {
                  external_source: 'imdb_id',
                  language: 'pt-BR',
                })
              : Effect.undefined,
            (answer): Card => {
              const [film] = list(field(answer?.body, 'movie_results'))
              const poster = field(film, 'poster_path')
              const title = field(film, 'title')
              return {
                poster: truthy(poster) ? `${IMAGES}${String(poster)}` : null,
                titlePt: truthy(title) ? String(title) : null,
                overview: pyStrip(text(field(film, 'overview'))) || null,
              }
            },
          ),
      })
    }),
  )
}
