// TMDB (`filmes/sob_demanda/tmdb.py`): the film search by title and year,
// for what Wikidata did not resolve in the Letterboxd import, and the card
// (poster, Portuguese title, synopsis) of the Recommendation's films, and
// the trailer (#289) and the synopsis (#385) of the Cartaz's.
// Cached for 6 months; the key is FILMES_TMDB_CHAVE (the v3 key, sent as
// `api_key`, or the v4 read token, sent in the header).
//
// Seven requests, each one cache entry and one recording file:
//
//     filme-<slug>-<year>-<hash>   GET /search/movie?query=<title>&primary_release_year=<year>
//     serie-<slug>-<year>-<hash>   GET /search/tv?query=<title>&first_air_date_year=<year>
//     externos-<id>                GET /movie/<id>/external_ids, for the imdb_id
//     detalhes-<id>                GET /movie/<id>, for the runtime of candidates with few votes
//     find-<tconst>-pt-BR          GET /find/<tconst>?external_source=imdb_id&language=pt-BR,
//                                  for the poster, the Portuguese title and the synopsis
//     videos-<id>                  GET /movie/<id>/videos?language=pt-BR&include_video_language=pt,en,
//                                  for the trailer, with the TMDB id the /find gave
//     sinopse-<id>-en-US           GET /movie/<id>?language=en-US, for the English synopsis
//                                  of a film with no pt-BR one, with the same id
//
// The search takes the title as the export gave it; the hash tells apart
// titles with the same slug. The import and the card are two profiles of the
// one API, as in the Python (`TMDB` and `CapasTMDB`): each is switched off
// on its own and warns with its own consequence; the trailer and the
// synopsis belong to the card. The trailer is the official one on YouTube, in pt-BR if there is
// one, else in English: a link, never a player. The synopsis is the pt-BR
// overview, else the English one. TMDB's terms ask for
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
  type Obtain,
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
const YOUTUBE = 'https://www.youtube.com/watch?v='

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
const YOUTUBE_KEY = /^[\w-]+$/

/** What the card shows of a film; each one `null` with no answer, no film
 * or no value. */
export interface Card {
  /** The poster's URL, at w185. */
  readonly poster: string | null
  readonly titlePt: string | null
  readonly overview: string | null
}

type SourceError = EngineError | SqliteError

/** One request: the first page, and for a search every other page into the
 * same entry. */
const live =
  (path: string, params: Readonly<Record<string, string>>) =>
  (apiKey: string) =>
    Effect.gen(function* () {
      const query = new URLSearchParams(params)
      const headers: Record<string, string> = {}
      if (apiKey.length > 40) headers['Authorization'] = `Bearer ${apiKey}`
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
        if (truthy(answer)) results.push(...list(field(answer, 'results')))
      }
      return { ...(body as object), results }
    })

const results = (answer: CachedAnswer | undefined) =>
  answer === undefined ? undefined : list(field(answer.body, 'results'))

/** One request through the cache, the recordings or TMDB. */
const askWith =
  (obtain: Obtain) =>
  (
    profile: SourceProfile,
    key: string,
    path: string,
    params: Readonly<Record<string, string>> = {},
  ) =>
    obtain(profile, key, live(path, params))

/** A search by title and year, of films or of series. */
const searchWith =
  (ask: ReturnType<typeof askWith>) =>
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

const searchDisabled = Effect.gen(function* () {
  return yield* (yield* Run).isSourceDisabled(SEARCH.id)
})

const imdbIdOf = (answer: CachedAnswer | undefined) => {
  const imdb = text(field(answer?.body, 'imdb_id'))
  return TCONST.test(imdb) ? imdb : undefined
}

const runtimeOf = (answer: CachedAnswer | undefined) => {
  const minutes = field(answer?.body, 'runtime')
  return truthy(minutes) ? Number(minutes) : undefined
}

/** What tells two films of the same title apart (#274): the directors,
 * the runtime, the production countries (ISO 3166-1), the original
 * language (ISO 639-1) and the pt-BR synopsis, when TMDB has one. */
export interface FilmDetails {
  readonly directors: ReadonlyArray<string>
  readonly runtime: number | null
  readonly countries: ReadonlyArray<string>
  readonly language: string | null
  readonly overviewPt: string | null
}

const detailsOf = (answer: CachedAnswer | undefined): FilmDetails | null => {
  const body = answer?.body
  if (!truthy(body)) return null
  const minutes = field(body, 'runtime')
  const language = field(body, 'original_language')
  return {
    directors: list(field(field(body, 'credits'), 'crew'))
      .filter((person) => field(person, 'job') === 'Director')
      .map((person) => text(field(person, 'name')))
      .filter((name) => name !== ''),
    runtime: truthy(minutes) ? Number(minutes) : null,
    countries: list(field(body, 'production_countries'))
      .map((country) => text(field(country, 'iso_3166_1')))
      .filter((code) => /^[A-Z]{2}$/.test(code)),
    language:
      typeof language === 'string' && /^[a-z]{2}$/.test(language)
        ? language
        : null,
    overviewPt: pyStrip(text(field(body, 'overview'))) || null,
  }
}

/** The TMDB id of the film a /find answered. */
const foundId = (answer: CachedAnswer | undefined) => {
  const [film] = list(field(answer?.body, 'movie_results'))
  const id = field(film, 'id')
  return Number.isSafeInteger(id) ? String(id) : undefined
}

/** The trailer's languages, the first preferred: pt-BR, then English. */
const isPtBr = (video: unknown) =>
  field(video, 'iso_639_1') === 'pt' && field(video, 'iso_3166_1') === 'BR'
const isEnglish = (video: unknown) => field(video, 'iso_639_1') === 'en'

/** The official YouTube trailer's link, pt-BR first, then English, in
 * TMDB's order; `null` with none. */
const trailerOf = (answer: CachedAnswer | undefined): string | null => {
  const trailers = list(field(answer?.body, 'results')).filter(
    (video) =>
      field(video, 'site') === 'YouTube' &&
      field(video, 'type') === 'Trailer' &&
      field(video, 'official') === true &&
      YOUTUBE_KEY.test(text(field(video, 'key'))),
  )
  const chosen = trailers.find(isPtBr) ?? trailers.find(isEnglish)
  return chosen === undefined ? null : `${YOUTUBE}${text(field(chosen, 'key'))}`
}

/** A film's synopsis and the language it is in: TMDB's pt-BR overview,
 * else its English one. */
export interface Synopsis {
  readonly text: string
  readonly language: 'pt' | 'en'
}

const overviewOf = (body: unknown) =>
  pyStrip(text(field(body, 'overview'))) || null

const cardOf = (answer: CachedAnswer | undefined): Card => {
  const [film] = list(field(answer?.body, 'movie_results'))
  const poster = field(film, 'poster_path')
  const title = field(film, 'title')
  return {
    poster: truthy(poster) ? `${IMAGES}${String(poster)}` : null,
    titlePt: truthy(title) ? String(title) : null,
    overview: overviewOf(film),
  }
}

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
    /** Directors, runtime, countries, original language and the pt-BR
     * synopsis of a TMDB film; null with no answer. */
    readonly details: (
      tmdbId: string | number,
    ) => Effect.Effect<FilmDetails | null, SourceError, Run>
    /** Whether the search went off in this request (the import tells "no
     * answer" from "not found" by it). */
    readonly searchDisabled: Effect.Effect<boolean, never, Run>
    /** Poster, Portuguese title and overview, from one pt-BR lookup. */
    readonly card: (tconst: string) => Effect.Effect<Card, SourceError, Run>
    /** The official YouTube trailer's link, from the card's lookup and the
     * film's videos; `null` with no answer or no trailer. */
    readonly trailer: (
      tconst: string,
    ) => Effect.Effect<string | null, SourceError, Run>
    /** The pt-BR overview of the card's lookup, else the English one of
     * the film it gave; `null` with no answer or no overview. */
    readonly synopsis: (
      tconst: string,
    ) => Effect.Effect<Synopsis | null, SourceError, Run>
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

      const ask = askWith(obtain)
      const search = searchWith(ask)
      const find = (tconst: string) =>
        TCONST.test(tconst)
          ? ask(POSTERS, `find-${tconst}-pt-BR`, `/find/${tconst}`, {
              external_source: 'imdb_id',
              language: 'pt-BR',
            })
          : Effect.undefined

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
            imdbIdOf,
          )
        },
        runtime: (tmdbId) => {
          const id = String(tmdbId)
          if (!TMDB_ID.test(id)) return Effect.undefined
          return Effect.map(
            ask(SEARCH, `detalhes-${id}`, `/movie/${id}`),
            runtimeOf,
          )
        },
        details: (tmdbId) => {
          const id = String(tmdbId)
          if (!TMDB_ID.test(id)) return Effect.succeed(null)
          return Effect.map(
            ask(SEARCH, `ficha-${id}`, `/movie/${id}`, {
              language: 'pt-BR',
              append_to_response: 'credits',
            }),
            detailsOf,
          )
        },
        searchDisabled,
        card: (tconst) => Effect.map(find(tconst), cardOf),
        trailer: (tconst) =>
          Effect.gen(function* () {
            const id = foundId(yield* find(tconst))
            if (id === undefined) return null
            return trailerOf(
              yield* ask(POSTERS, `videos-${id}`, `/movie/${id}/videos`, {
                language: 'pt-BR',
                include_video_language: 'pt,en',
              }),
            )
          }),
        synopsis: (tconst) =>
          Effect.gen(function* () {
            const found = yield* find(tconst)
            const [film] = list(field(found?.body, 'movie_results'))
            const pt = overviewOf(film)
            if (pt !== null) return { text: pt, language: 'pt' as const }
            const id = foundId(found)
            if (id === undefined) return null
            const en = overviewOf(
              (yield* ask(POSTERS, `sinopse-${id}-en-US`, `/movie/${id}`, {
                language: 'en-US',
              }))?.body,
            )
            return en === null ? null : { text: en, language: 'en' as const }
          }),
      })
    }),
  )
}
