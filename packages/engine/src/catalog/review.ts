// `catalogo/review.py`: the GroupLens dumps behind the Review Signals.
// From ml-32m, the item-item neighbourhood of the 4+ ratings and the tags
// counted by distinct user; from the Tag Genome 2021, each tag's relevance.
// The evaluation shares the tag counting and the Fatos with the Catalog.

import { Effect } from 'effect'
import { compareTuple } from '../compat/compare.ts'
import { factId, pyInt, type PyValue } from '../compat/fact-id.ts'
import { pyParseFloat, pyParseInt } from '../compat/parse.ts'
import { pythonError } from '../compat/python-error.ts'
import { pyReprStr, pyStrip } from '../compat/text.ts'
import { HIGH_RATING } from '../evidence/ruler.ts'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'
import { CsvDictRows, CsvRecords } from './csv-stream.ts'
import { computeNeighbors } from './neighbors.ts'
import { forEachBatch, lineBatches, utf8Text } from './text-source.ts'
import {
  dumpPath,
  GENOME,
  MOVIELENS,
  type Dump,
  type Dumps,
} from './versions.ts'
import { zipMember } from './zip-file.ts'

/** `contar_tags`: distinct users by (film, tag), as `(film, tag, users)`,
 * by film then tag. `rows` gives (userId, movieId, tag) of tags.csv; `map`
 * takes the movieId (text) to the tconst. The tag counts lower-cased and
 * stripped; the users in `excluded` do not count (the evaluation leaves its
 * sampled users out). A userId `int()` refuses throws Python's
 * ValueError. */
export const countTags = (
  rows: Iterable<readonly [string, string, string]>,
  map: ReadonlyMap<string, string>,
  excluded: ReadonlySet<number> = new Set(),
): Array<readonly [string, string, number]> => {
  const users = new Map<
    string,
    { film: string; tag: string; ids: Set<number> }
  >()
  for (const [userId, movieId, rawTag] of rows) {
    const film = map.get(movieId)
    const tag = pyStrip(rawTag).toLowerCase()
    const user = pyParseInt(userId)
    if (user === null)
      throw pythonError(
        'ValueError',
        `invalid literal for int() with base 10: ${pyReprStr(userId)}`,
      )
    if (film && tag && !excluded.has(user)) {
      const key = `${film}\0${tag}`
      const entry = users.get(key) ?? { film, tag, ids: new Set<number>() }
      entry.ids.add(user)
      users.set(key, entry)
    }
  }
  return [...users.values()]
    .sort((a, b) => compareTuple([a.film, a.tag], [b.film, b.tag]))
    .map(({ film, tag, ids }) => [film, tag, ids.size] as const)
}

/** `fatos`: each row with Fonte and date after it and its `fato_id` in
 * front, one at a time. Numbers are Python ints. */
export function* reviewFactRows(
  table: string,
  rows: Iterable<ReadonlyArray<string | number>>,
  [source, date]: readonly [string, string],
): Generator<Array<string | number>> {
  for (const row of rows) {
    const values = [...row, source, date]
    const typed: PyValue[] = values.map((v) =>
      typeof v === 'number' ? pyInt(v) : v,
    )
    yield [factId(table, ...typed), ...values]
  }
}

/** `fatos`, collected. */
export const reviewFacts = (
  table: string,
  rows: Iterable<ReadonlyArray<string | number>>,
  sourceAndDate: readonly [string, string],
): Array<Array<string | number>> => [
  ...reviewFactRows(table, rows, sourceAndDate),
]

/** `FONTES`: each GroupLens dump's Fonte, date and URL. The dumps never
 * change, so `atualizar` pins them with this date. */
export const GROUPLENS_SOURCES: ReadonlyMap<
  string,
  { readonly source: string; readonly date: string; readonly url: string }
> = new Map([
  [
    MOVIELENS,
    {
      source: 'MovieLens ml-32m',
      date: '2023-10-13',
      url: 'https://files.grouplens.org/datasets/movielens/ml-32m.zip',
    },
  ],
  [
    GENOME,
    {
      source: 'Tag Genome 2021',
      date: '2021-12-30',
      url: 'https://files.grouplens.org/datasets/tag-genome-2021/genome_2021.zip',
    },
  ],
])

const MOVIELENS_MEMBERS = {
  links: 'ml-32m/links.csv',
  ratings: 'ml-32m/ratings.csv',
  tags: 'ml-32m/tags.csv',
} as const
const GENOME_MEMBERS = {
  metadata: 'movie_dataset_public_final/raw/metadata.json',
  scores: 'movie_dataset_public_final/scores/glmer.csv',
} as const

/** `validar_zip`: reads every member the loading reads to its end, so a
 * download cut short or corrupt fails here, before it is pinned. */
export const validateZip = async (path: string, name: string) => {
  const members =
    name === MOVIELENS
      ? Object.values(MOVIELENS_MEMBERS)
      : Object.values(GENOME_MEMBERS)
  for (const member of members)
    for await (const chunk of zipMember(path, member)) void chunk
}

type Lookup = (column: string) => string | null

/** `csv.DictReader` over a ZIP member (`utf-8`, `newline=""`), a batch of
 * rows per chunk. */
async function* csvRows(zip: string, member: string): AsyncGenerator<Lookup[]> {
  const records = new CsvRecords()
  const dict = new CsvDictRows()
  for await (const lines of lineBatches(utf8Text(zipMember(zip, member)))) {
    const rows = dict.push(records.push(lines))
    if (rows.length > 0) yield rows
  }
  const rows = dict.push(records.push([], true))
  if (rows.length > 0) yield rows
}

/** A column a row lacks is Python's `None`, which the next step refuses. */
const present = (value: string | null, column: string): string => {
  if (value === null)
    throw pythonError(
      'TypeError',
      `column ${pyReprStr(column)} is None in a short row`,
    )
  return value
}

/** `_imdb`: "tt" and the digits, or `undefined`. */
const imdbId = (value: unknown): string | undefined => {
  if (value === null || value === undefined || value === '') return undefined
  if (typeof value !== 'string')
    throw pythonError(
      'AttributeError',
      `'${typeof value === 'number' ? 'int' : typeof value}' object has no attribute 'isdecimal'`,
    )
  return /^\p{Nd}+$/u.test(value) ? `tt${value}` : undefined
}

const sourceOf = (dump: Dump): readonly [string, string] => {
  if (dump.source === undefined) throw pythonError('KeyError', "'source'")
  return [dump.source, dump.date]
}

/** MovieLens rates from 0.5 to 5 in half steps. */
const RATING_STEPS = 10

/** `(film, ratings, entropy)` of each film with a rating: the entropy, in
 * bits, of its ratings' histogram by half step (`entropia_movielens`). */
function* spreadRows(
  films: readonly string[],
  spread: Int32Array,
): Generator<readonly [string, number, number]> {
  for (const [index, film] of films.entries()) {
    const counts = spread.subarray(
      index * RATING_STEPS,
      (index + 1) * RATING_STEPS,
    )
    const total = counts.reduce((sum, count) => sum + count, 0)
    if (total === 0) continue
    let entropy = 0
    for (const count of counts)
      if (count > 0) entropy += (count / total) * Math.log2(total / count)
    yield [film, total, entropy]
  }
}

/** `vizinhos(notas, links)`, the ratings' spread and the tags of ml-32m. */
const loadMovielens = (db: Connection, zip: string, dump: Dump) =>
  Effect.gen(function* () {
    const sourceAndDate = sourceOf(dump)
    const map = new Map<string, string>()
    yield* forEachBatch(csvRows(zip, MOVIELENS_MEMBERS.links), (rows) =>
      Effect.sync(() => {
        for (const row of rows) {
          const imdb = imdbId(row('imdbId'))
          if (imdb !== undefined)
            map.set(present(row('movieId'), 'movieId'), imdb)
        }
      }),
    )
    const films = [...new Set(map.values())].sort((a, b) =>
      compareTuple([a], [b]),
    )
    const index = new Map(films.map((film, i) => [film, i] as const))
    const byMovieId = new Map(
      [...map].map(([movieId, film]) => [movieId, index.get(film)!] as const),
    )
    let items = new Int32Array(1 << 20)
    let users = new Int32Array(1 << 20)
    let votes = 0
    const spread = new Int32Array(films.length * RATING_STEPS)
    yield* forEachBatch(csvRows(zip, MOVIELENS_MEMBERS.ratings), (rows) =>
      Effect.sync(() => {
        for (const row of rows) {
          const movieId = row('movieId')
          const item = movieId === null ? undefined : byMovieId.get(movieId)
          if (item === undefined) continue
          const rating = pyParseFloat(present(row('rating'), 'rating'))
          const step = Math.round(rating * 2) - 1
          const bin = Math.min(RATING_STEPS - 1, Math.max(0, step))
          spread[item * RATING_STEPS + bin]! += 1
          if (!(rating >= HIGH_RATING)) continue
          const user = pyParseInt(present(row('userId'), 'userId'))
          if (user === null)
            throw pythonError(
              'ValueError',
              `invalid literal for int() with base 10: ${pyReprStr(row('userId')!)}`,
            )
          if (votes === items.length) {
            const grownItems = new Int32Array(votes * 2)
            grownItems.set(items)
            items = grownItems
            const grownUsers = new Int32Array(votes * 2)
            grownUsers.set(users)
            users = grownUsers
          }
          items[votes] = item
          users[votes] = user
          votes += 1
        }
      }),
    )
    yield* db.runMany(
      'INSERT INTO vizinhos VALUES (?, ?, ?, ?, ?, ?, ?)',
      reviewFactRows(
        'vizinhos',
        computeNeighbors(
          films,
          items.subarray(0, votes),
          users.subarray(0, votes),
        ),
        sourceAndDate,
      ),
    )
    yield* db.runMany(
      'INSERT INTO entropia_movielens VALUES (?, ?, ?)',
      spreadRows(films, spread),
    )
    const tagRows: Array<readonly [string, string, string]> = []
    yield* forEachBatch(csvRows(zip, MOVIELENS_MEMBERS.tags), (rows) =>
      Effect.sync(() => {
        for (const row of rows)
          tagRows.push([
            present(row('userId'), 'userId'),
            present(row('movieId'), 'movieId'),
            present(row('tag'), 'tag'),
          ])
      }),
    )
    yield* db.runMany(
      'INSERT INTO tags_movielens VALUES (?, ?, ?, ?, ?, ?)',
      reviewFactRows('tags_movielens', countTags(tagRows, map), sourceAndDate),
    )
  })

/** The lines of a binary stream split on "\n" only (Python iterating a
 * binary file), decoded. */
async function* binaryLines(
  bytes: AsyncIterable<Buffer>,
): AsyncGenerator<string[]> {
  let pending = ''
  for await (const text of utf8Text(bytes)) {
    const parts = (pending + text).split('\n')
    pending = parts.pop()!
    if (parts.length > 0) yield parts
  }
  if (pending.length > 0) yield [pending]
}

/** `_carregar_genoma`: each tag's relevance, the highest kept when two
 * Tag Genome items share a tconst. */
const loadGenome = (db: Connection, zip: string, dump: Dump) =>
  Effect.gen(function* () {
    const sourceAndDate = sourceOf(dump)
    const map = new Map<string, string>()
    yield* forEachBatch(
      binaryLines(zipMember(zip, GENOME_MEMBERS.metadata)),
      (lines) =>
        Effect.sync(() => {
          for (const line of lines) {
            const row = JSON.parse(line) as Record<string, unknown>
            const imdb = imdbId(row['imdbId'])
            if (imdb !== undefined) map.set(String(row['item_id']), imdb)
          }
        }),
    )
    yield* forEachBatch(csvRows(zip, GENOME_MEMBERS.scores), (rows) =>
      db.runMany(
        `INSERT INTO genoma VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(filme_id, tag) DO UPDATE SET
             fato_id = excluded.fato_id, relevancia = excluded.relevancia
         WHERE excluded.relevancia > genoma.relevancia`,
        (function* () {
          for (const row of rows) {
            const itemId = row('item_id')
            const film = itemId === null ? undefined : map.get(itemId)
            const tag = pyStrip(present(row('tag'), 'tag')).toLowerCase()
            if (film === undefined || tag === '') continue
            const score = present(row('score'), 'score')
            // The `fato_id` hashes the score as written, not the float.
            const [source, date] = sourceAndDate
            yield [
              factId('genoma', film, tag, score, source, date),
              film,
              tag,
              pyParseFloat(score),
              source,
              date,
            ]
          }
        })(),
      ),
    )
  })

/** `carregar`: nothing without ml-32m in the manifest (the manifest check
 * already asked for both GroupLens dumps together). */
export const loadReview = (
  db: Connection,
  catalog: string,
  dumps: Dumps,
): Effect.Effect<void, SqliteError> =>
  Effect.gen(function* () {
    const movielens = dumps.get(MOVIELENS)
    if (movielens === undefined) return
    yield* loadMovielens(db, dumpPath(catalog, MOVIELENS, movielens), movielens)
    const genome = dumps.get(GENOME)!
    yield* loadGenome(db, dumpPath(catalog, GENOME, genome), genome)
  })
