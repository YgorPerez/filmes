// Parecença [similarity] between a reference film and the others in the
// Catálogo (`recomendacao/parecenca.py`, #67).
//
// Each source gives the pair (reference, film) a number from 0 to 1:
//
// - genome: the reference's most distinctive Tag Genome tags (relevance
//   above the tag's mean) and how much of each excess the film has too;
// - movielens_tags: cosine of the TF-IDF vectors of tags.csv (log of 1 +
//   users, times the tag's rarity);
// - neighbors: the item-item cosine of the reference's neighbour, both /
//   sqrt(reference's base × neighbour's base), over the strongest one's; a
//   MovieLens film outside its neighbours counts 0;
// - genre: Jaccard of the IMDb genres;
// - people: 1 if it shares the director; else how many of the first 3
//   actors it shares, over 3.
//
// A source with no data on one side stays out of the pair, and the
// similarity is the mean of the present ones with the `[similar.weight]`
// weights (the missing one's weight spreads over the others). Only a film
// with genome, tags or neighbours above 0, or the same director, comes in:
// genre and actors in common, alone, do not make a film similar.
//
// The tag means, the tag rarities and each film's vector norm are ready
// from the rebuild (`banco/etapas/70_parecenca.py`).
//
// The order of everything summed is Python's: a pair's sources keep their
// insertion order (it feeds `pySum`), and every query has a total `ORDER BY`.

import { Effect } from 'effect'
import { compareTuple } from '../compat/compare.ts'
import { pyLog1pInt } from '../compat/log1p.ts'
import { pySum } from '../compat/number.ts'
import type { Weights } from '../runtime/Weights.ts'
import { num, text, textOrNull } from '../sqlite/row.ts'
import type { Connection, Row, SqliteError } from '../sqlite/Sqlite.ts'

/** The similarity sources, by their `[similar.weight]` key. */
export type SimilaritySource =
  | 'genome'
  | 'movielens_tags'
  | 'neighbors'
  | 'genre'
  | 'people'

/** Where a theme, a neighbour or the director edge came from. */
export interface Cited {
  readonly source: string
  readonly date: string | null
}

export interface Theme extends Cited {
  readonly weight: number
}

export interface Neighbor extends Cited {
  readonly base: number
  readonly both: number
}

/** One pair (reference, film) (Python's `Par`). */
export interface Pair {
  /** Source → similarity from 0 to 1, in the order Python inserted them. */
  readonly sources: Map<SimilaritySource, number>
  /** Tag in common → its weight and citation, for the explanation. */
  readonly themes: Map<string, Theme>
  /** The reference's neighbour row, if the film is one. */
  neighbor: Neighbor | null
  /** The director edge, if it shares the director. */
  director: Cited | null
}

const newPair = (): Pair => ({
  sources: new Map(),
  themes: new Map(),
  neighbor: null,
  director: null,
})

const weightOf = (
  weights: Weights['similar']['weight'],
  source: SimilaritySource,
): number => {
  const weight = weights[source]
  if (weight === undefined) throw new TypeError(`KeyError: '${source}'`)
  return weight
}

/** The weighted mean of the pair's sources (`Par.valor`). */
export const pairValue = (
  pair: Pair,
  weights: Weights['similar']['weight'],
): number => {
  const present = [...pair.sources]
  const total = pySum(present.map(([source]) => weightOf(weights, source)))
  return total
    ? pySum(present.map(([source, v]) => weightOf(weights, source) * v)) / total
    : 0
}

/** The heaviest tags in common: (tag, citation), at most `count`
 * (`Par.temas_principais`). */
export const mainThemes = (
  pair: Pair,
  count = 3,
): ReadonlyArray<readonly [string, Cited]> =>
  [...pair.themes]
    .sort((a, b) => compareTuple([-a[1].weight, a[0]], [-b[1].weight, b[0]]))
    .slice(0, count)

/** Ids as a JSON list, for `IN (SELECT value FROM json_each(?))`
 * (`lista_json`; membership only, so the order is free). */
export const jsonList = (ids: Iterable<string>): string =>
  JSON.stringify([...ids].sort())

type Pairs = Map<string, Pair>

const MOVIELENS: ReadonlyArray<SimilaritySource> = [
  'genome',
  'movielens_tags',
  'neighbors',
]

/** Genome, tags or neighbours above 0, or the same director
 * (`_tem_algo_em_comum`). */
const hasSomethingInCommon = (pair: Pair): boolean =>
  MOVIELENS.some((source) => (pair.sources.get(source) ?? 0) > 0) ||
  pair.director !== null

/** The films of a list that have data in a source (`_COM_DADO`). */
const WITH_DATA: ReadonlyArray<readonly [SimilaritySource, string]> = [
  [
    'genome',
    'SELECT DISTINCT filme_id FROM genoma WHERE filme_id IN (SELECT value FROM json_each(?))',
  ],
  [
    'movielens_tags',
    'SELECT DISTINCT filme_id FROM tags_movielens WHERE filme_id IN (SELECT value FROM json_each(?))',
  ],
  [
    'neighbors',
    'SELECT DISTINCT filme_id FROM vizinhos WHERE filme_id IN (SELECT value FROM json_each(?))',
  ],
  [
    'people',
    `SELECT filme_id FROM arestas WHERE predicado = 'diretor'
       AND filme_id IN (SELECT value FROM json_each(?1))
     UNION SELECT filme_id FROM elenco_principal_imdb WHERE filme_id IN (SELECT value FROM json_each(?1))`,
  ],
]

/** The similarity of every film that has something in common with the
 * reference (`medir`). */
export const measure = (
  db: Connection,
  reference: string,
  config: Weights['similar'],
): Effect.Effect<Pairs, SqliteError> =>
  Effect.gen(function* () {
    let pairs: Pairs = new Map()
    const pairOf = (filmId: string): Pair => {
      const found = pairs.get(filmId)
      if (found) return found
      const created = newPair()
      pairs.set(filmId, created)
      return created
    }
    // A source the reference has: the film with data in it and nothing in
    // common gets 0.
    const present = new Map<SimilaritySource, boolean>([
      ['genome', yield* genome(db, reference, config, pairOf)],
      ['movielens_tags', yield* tags(db, reference, config, pairOf)],
      ['neighbors', yield* neighbors(db, reference, pairOf)],
      ['people', yield* people(db, reference, pairOf)],
    ])
    pairs.delete(reference)
    pairs = new Map([...pairs].filter(([, pair]) => hasSomethingInCommon(pair)))
    for (const [source, sql] of WITH_DATA) {
      if (!present.get(source)) continue
      const missing = [...pairs]
        .filter(([, pair]) => !pair.sources.has(source))
        .map(([filmId]) => filmId)
      for (const row of yield* db.all(sql, jsonList(missing)))
        pairs.get(text(row, 'filme_id'))?.sources.set(source, 0)
    }
    yield* genres(db, reference, pairs)
    return pairs
  })

const setTheme = (
  pair: Pair,
  tag: string,
  weight: number,
  cited: Cited,
): void => {
  if (weight > 0 && weight > (pair.themes.get(tag)?.weight ?? 0))
    pair.themes.set(tag, { weight, ...cited })
}

const cited = (row: Row): Cited => ({
  source: text(row, 'fonte'),
  date: textOrNull(row, 'data'),
})

/** The value ready for each tag in a source (`_por_tag`,
 * `tags_no_catalogo`). */
const byTag = (
  db: Connection,
  source: 'genoma' | 'tags_movielens',
  tagList: Iterable<string>,
): Effect.Effect<Map<string, number>, SqliteError> =>
  db
    .all(
      'SELECT tag, valor FROM tags_no_catalogo WHERE fonte = ? AND tag IN (SELECT value FROM json_each(?))',
      source,
      jsonList(tagList),
    )
    .pipe(
      Effect.map(
        (rows) =>
          new Map(rows.map((row) => [text(row, 'tag'), num(row, 'valor')])),
      ),
    )

const valueOf = (values: Map<string, number>, tag: string): number => {
  const value = values.get(tag)
  if (value === undefined) throw new TypeError(`KeyError: '${tag}'`)
  return value
}

const genome = (
  db: Connection,
  reference: string,
  config: Weights['similar'],
  pairOf: (filmId: string) => Pair,
): Effect.Effect<boolean, SqliteError> =>
  Effect.gen(function* () {
    const ofReference = yield* db.all(
      'SELECT tag, relevancia FROM genoma WHERE filme_id = ? ORDER BY relevancia DESC, tag LIMIT ?',
      reference,
      config.genome_tags_considered,
    )
    if (ofReference.length === 0) return false
    const mean = yield* byTag(
      db,
      'genoma',
      ofReference.map((row) => text(row, 'tag')),
    )
    const excess = new Map(
      ofReference.map((row) => {
        const tag = text(row, 'tag')
        return [tag, num(row, 'relevancia') - valueOf(mean, tag)] as const
      }),
    )
    const own = new Map(
      [...excess]
        .filter(([, e]) => e > 0)
        .sort((a, b) => compareTuple([-a[1], a[0]], [-b[1], b[0]]))
        .slice(0, config.genome_tags),
    )
    const total = pySum(own.values())
    if (!total) return false
    for (const row of yield* db.all(
      'SELECT filme_id, tag, relevancia, fonte, data FROM genoma WHERE tag IN (SELECT value FROM json_each(?)) ORDER BY filme_id, tag',
      jsonList(own.keys()),
    )) {
      const tag = text(row, 'tag')
      const common = Math.min(
        valueOf(own, tag),
        Math.max(num(row, 'relevancia') - valueOf(mean, tag), 0),
      )
      const pair = pairOf(text(row, 'filme_id'))
      pair.sources.set(
        'genome',
        (pair.sources.get('genome') ?? 0) + common / total,
      )
      setTheme(pair, tag, common / total, cited(row))
    }
    return true
  })

const tags = (
  db: Connection,
  reference: string,
  config: Weights['similar'],
  pairOf: (filmId: string) => Pair,
): Effect.Effect<boolean, SqliteError> =>
  Effect.gen(function* () {
    const ofReference = new Map(
      (yield* db.all(
        'SELECT tag, usuarios FROM tags_movielens WHERE filme_id = ? ORDER BY tag',
        reference,
      )).map((row) => [text(row, 'tag'), num(row, 'usuarios')]),
    )
    if (ofReference.size === 0) return false
    // TF-IDF: log(1 + users) times the tag's rarity. "overrated" and "love"
    // are on thousands of films and say little; "writers" says more.
    const rarity = yield* byTag(db, 'tags_movielens', ofReference.keys())
    const vector = new Map(
      [...ofReference].map(
        ([tag, users]) =>
          [tag, pyLog1pInt(users) * valueOf(rarity, tag)] as const,
      ),
    )
    const norm = Math.sqrt(pySum([...vector.values()].map((w) => w * w)))
    if (!norm) return false
    // Only the reference's heaviest tags look for films; the product uses
    // them all.
    const search = new Set(
      [...vector.keys()]
        .sort((a, b) =>
          compareTuple([-valueOf(vector, a), a], [-valueOf(vector, b), b]),
        )
        .slice(0, config.movielens_tags),
    )
    const products = new Map<string, number>()
    const common = new Map<string, Array<readonly [Row, number]>>()
    for (const row of yield* db.all(
      `SELECT t.filme_id, t.tag, t.usuarios, t.fonte, t.data, n.norma FROM tags_movielens t
       JOIN normas_tags_movielens n ON n.filme_id = t.filme_id
       WHERE t.tag IN (SELECT value FROM json_each(?1)) AND t.filme_id IN
       (SELECT filme_id FROM tags_movielens WHERE tag IN (SELECT value FROM json_each(?2)))
       ORDER BY t.filme_id, t.tag`,
      jsonList(vector.keys()),
      jsonList(search),
    )) {
      const filmNorm = num(row, 'norma')
      if (!filmNorm) continue
      const filmId = text(row, 'filme_id')
      const tag = text(row, 'tag')
      const w =
        (pyLog1pInt(num(row, 'usuarios')) * valueOf(rarity, tag)) /
        (norm * filmNorm)
      products.set(
        filmId,
        (products.get(filmId) ?? 0) + valueOf(vector, tag) * w,
      )
      if (search.has(tag))
        common.set(filmId, [...(common.get(filmId) ?? []), [row, w]])
    }
    for (const [filmId, product] of products) {
      const pair = pairOf(filmId)
      pair.sources.set('movielens_tags', product)
      for (const [row, w] of common.get(filmId) ?? []) {
        const tag = text(row, 'tag')
        setTheme(pair, tag, valueOf(vector, tag) * w, cited(row))
      }
    }
    return true
  })

/** "Of 412 who gave X 4+, 61% gave Y 4+" favours the film everyone loves;
 * the similarity divides both sides: both / sqrt(X's base × Y's base),
 * with Y's base from the row where it is the seed (without one, X's). */
const neighbors = (
  db: Connection,
  reference: string,
  pairOf: (filmId: string) => Pair,
): Effect.Effect<boolean, SqliteError> =>
  Effect.gen(function* () {
    const ofReference = yield* db.all(
      'SELECT vizinho_id, base, ambos, fonte, data FROM vizinhos WHERE filme_id = ? ORDER BY vizinho_id',
      reference,
    )
    if (ofReference.length === 0) return false
    const bases = new Map(
      (yield* db.all(
        'SELECT filme_id, max(base) AS base FROM vizinhos WHERE filme_id IN (SELECT value FROM json_each(?)) GROUP BY filme_id',
        jsonList(ofReference.map((row) => text(row, 'vizinho_id'))),
      )).map((row) => [text(row, 'filme_id'), num(row, 'base')]),
    )
    const cosine = new Map(
      ofReference.map((row) => {
        const id = text(row, 'vizinho_id')
        const base = num(row, 'base')
        return [
          id,
          num(row, 'ambos') / Math.sqrt(base * (bases.get(id) ?? base)),
        ] as const
      }),
    )
    const highest = Math.max(...cosine.values())
    if (!highest) return false
    for (const row of ofReference) {
      const id = text(row, 'vizinho_id')
      const pair = pairOf(id)
      pair.sources.set('neighbors', valueOf(cosine, id) / highest)
      pair.neighbor = {
        base: num(row, 'base'),
        both: num(row, 'ambos'),
        ...cited(row),
      }
    }
    return true
  })

const people = (
  db: Connection,
  reference: string,
  pairOf: (filmId: string) => Pair,
): Effect.Effect<boolean, SqliteError> =>
  Effect.gen(function* () {
    const directors = (yield* db.all(
      "SELECT entidade_id FROM arestas WHERE filme_id = ? AND predicado = 'diretor' ORDER BY entidade_id",
      reference,
    )).map((row) => text(row, 'entidade_id'))
    const actors = (yield* db.all(
      'SELECT ator_imdb FROM elenco_principal_imdb WHERE filme_id = ? ORDER BY ator_imdb',
      reference,
    )).map((row) => text(row, 'ator_imdb'))
    if (directors.length > 0)
      for (const row of yield* db.all(
        "SELECT filme_id, fonte, data FROM arestas WHERE predicado = 'diretor' AND entidade_id IN (SELECT value FROM json_each(?)) ORDER BY filme_id, data DESC",
        jsonList(new Set(directors)),
      )) {
        const pair = pairOf(text(row, 'filme_id'))
        pair.sources.set('people', 1)
        pair.director ??= cited(row)
      }
    if (actors.length > 0)
      for (const row of yield* db.all(
        'SELECT filme_id, count(*) AS comuns FROM elenco_principal_imdb WHERE ator_imdb IN (SELECT value FROM json_each(?)) GROUP BY filme_id ORDER BY filme_id',
        jsonList(new Set(actors)),
      )) {
        const pair = pairOf(text(row, 'filme_id'))
        pair.sources.set(
          'people',
          Math.max(
            pair.sources.get('people') ?? 0,
            Math.min(num(row, 'comuns') / 3, 1),
          ),
        )
      }
    return directors.length > 0 || actors.length > 0
  })

const genres = (
  db: Connection,
  reference: string,
  pairs: Pairs,
): Effect.Effect<void, SqliteError> =>
  Effect.gen(function* () {
    const ofReference = new Set(
      (yield* db.all(
        'SELECT genero FROM generos_imdb WHERE filme_id = ? ORDER BY genero',
        reference,
      )).map((row) => text(row, 'genero')),
    )
    if (ofReference.size === 0 || pairs.size === 0) return
    const byFilm = new Map<string, Set<string>>()
    for (const row of yield* db.all(
      'SELECT filme_id, genero FROM generos_imdb WHERE filme_id IN (SELECT value FROM json_each(?)) ORDER BY filme_id, genero',
      jsonList(pairs.keys()),
    )) {
      const filmId = text(row, 'filme_id')
      byFilm.set(
        filmId,
        new Set([...(byFilm.get(filmId) ?? []), text(row, 'genero')]),
      )
    }
    for (const [filmId, ofFilm] of byFilm) {
      const both = [...ofReference].filter((g) => ofFilm.has(g)).length
      const either = new Set([...ofReference, ...ofFilm]).size
      pairs.get(filmId)?.sources.set('genre', both / either)
    }
  })
