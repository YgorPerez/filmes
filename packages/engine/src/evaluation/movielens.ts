// The ml-32m sample (`avaliacao/movielens.py`): 1,000 users drawn with
// Python's `Random(27)`, held out of the item-item neighbourhood and of the
// MovieLens tags, and measured like the Pessoas.

import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { computeNeighbors } from '../catalog/neighbors.ts'
import { countTags, reviewFacts } from '../catalog/review.ts'
import { compareTuple } from '../compat/compare.ts'
import { factId, pyFloat } from '../compat/fact-id.ts'
import { pyParseFloat, pyParseInt } from '../compat/parse.ts'
import { pythonError } from '../compat/python-error.ts'
import { PyRandom } from '../compat/random.ts'
import { pyReprStr } from '../compat/text.ts'
import { HIGH_RATING } from '../evidence/ruler.ts'
import { similarity } from '../rebuild/steps/similarity.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import type { Connection, SqliteError } from '../sqlite/Sqlite.ts'
import { text } from '../sqlite/row.ts'
import { CsvLineError, csvColumns } from './csv.ts'
import { split, type MeasuredPerson, type TrainingRating } from './people.ts'

export const SEED = 27
export const SAMPLE_SIZE = 1000
/** The MovieLens dump's name in the versions manifest. */
const MOVIELENS_DUMP = 'ml-32m.zip'

/** Progress as Python's callback: (percent, message). */
export type Progress = (value: number, message: string) => Effect.Effect<void>

export interface Sample {
  readonly measured: ReadonlyArray<MeasuredPerson>
  readonly users: ReadonlySet<number>
  /** movieId → tconst. */
  readonly films: ReadonlyMap<number, string>
  /** The 4+ votes of the users outside the sample: films (sorted), then
   * (item index, user) pairs. */
  readonly votes: {
    readonly films: readonly string[]
    readonly items: Int32Array
    readonly users: Int32Array
  }
  readonly sourceAndDate: readonly [string, string]
}

const isFile = (path: string) => existsSync(path) && statSync(path).isFile()

/** `versoes.fonte_e_data`: the dump's Fonte and date from the manifest. */
const sourceAndDate = (
  manifest: string,
  name: string,
): Effect.Effect<readonly [string, string], EngineError> =>
  Effect.try({
    try: () => {
      if (!existsSync(manifest))
        throw new Error(
          `[Errno 2] No such file or directory: ${pyReprStr(manifest)}`,
        )
      const dump = (
        JSON.parse(readFileSync(manifest, 'utf8')) as {
          dumps: Record<string, { source: unknown; date: unknown }>
        }
      ).dumps[name]
      if (dump === undefined) throw new Error(pyReprStr(name))
      if (!('source' in dump)) throw new Error("'source'")
      if (!('date' in dump)) throw new Error("'date'")
      return [String(dump.source), String(dump.date)] as const
    },
    catch: (error) =>
      engineError(
        'invalid_versions',
        `${manifest}: sem fonte e data de ${name} (${error instanceof Error ? error.message : String(error)})`,
      ),
  })

const int = (value: string): number => {
  const parsed = pyParseInt(value)
  if (parsed === null)
    throw pythonError(
      'ValueError',
      `invalid literal for int() with base 10: ${pyReprStr(value)}`,
    )
  return parsed
}

/** `datetime.fromtimestamp(t, UTC).isoformat()`. */
const isoInstant = (seconds: number): string => {
  const date = new Date(seconds * 1000)
  const year = date.getUTCFullYear()
  if (!(year >= 1 && year <= 9999))
    throw pythonError('ValueError', `year ${year} is out of range`)
  return `${date.toISOString().slice(0, 19)}+00:00`
}

/** Python's `str(exception)` for the `dados_invalidos` message. */
const reason = (error: unknown): string => {
  if (error instanceof CsvLineError) return error.message
  if (error instanceof Error)
    return error.message.replace(/^[A-Za-z]+Error: /, '')
  return String(error)
}

/** `_pessoa`: a sampled user cut like a Pessoa, with her ratings before
 * the cut kept for training. `ratings` maps film → (instant, rating), in
 * the order films first appeared. */
const sampledPerson = (
  user: number,
  ratings: ReadonlyMap<string, readonly [number, number]>,
  source: string,
): MeasuredPerson | null => {
  const person = `movielens:${user}`
  const dates = new Map(
    [...ratings].map(([film, [instant]]) => [film, isoInstant(instant)]),
  )
  const values = new Map(
    [...ratings].map(([film, [, rating]]) => [film, rating]),
  )
  const measured = split(person, dates, values)
  if (measured === null) return null
  const training: TrainingRating[] = []
  for (const [film, date] of dates)
    if (date < measured.cut) {
      const rating = values.get(film)!
      const day = date.slice(0, 10)
      training.push([
        factId('notas', person, film, pyFloat(rating), day, source),
        person,
        film,
        rating,
        day,
        source,
      ])
    }
  return { ...measured, cut: measured.cut.slice(0, 10), training }
}

const RATING_COLUMNS = ['userId', 'movieId', 'rating', 'timestamp'] as const

/** links.csv's movieId → tconst, and the users drawn from ratings.csv. */
const drawUsers = (linksCsv: string, ratingsCsv: string) => {
  const films = new Map<number, string>()
  for (const [movieId, imdbId] of csvColumns(linksCsv, ['movieId', 'imdbId']))
    if (imdbId) films.set(int(movieId), `tt${imdbId}`)
  const ids = new Set<number>()
  for (const [userId] of csvColumns(ratingsCsv, RATING_COLUMNS))
    ids.add(int(userId))
  const sorted = [...ids].sort((a, b) => a - b)
  const drawn = new Set(
    new PyRandom(SEED).sample(sorted, Math.min(SAMPLE_SIZE, sorted.length)),
  )
  return { films, drawn }
}

/** The 4+ votes outside the sample, (user, item) pairs in typed arrays
 * that grow. */
class OutsideVotes {
  private users = new Int32Array(1024)
  private items = new Int32Array(1024)
  private votes = 0

  push(user: number, item: number): void {
    if (this.votes === this.users.length) {
      const grownUsers = new Int32Array(this.votes * 2)
      grownUsers.set(this.users)
      this.users = grownUsers
      const grownItems = new Int32Array(this.votes * 2)
      grownItems.set(this.items)
      this.items = grownItems
    }
    this.users[this.votes] = user
    this.items[this.votes] = item
    this.votes += 1
  }

  pairs(films: readonly string[]): Sample['votes'] {
    return {
      films,
      items: this.items.slice(0, this.votes),
      users: this.users.slice(0, this.votes),
    }
  }
}

/** A sampled user's rating, unless she rated the film later. */
const keepLatest = (
  mine: Map<string, readonly [number, number]>,
  film: string,
  instant: number,
  rating: number,
) => {
  const before = mine.get(film)
  if (before === undefined || instant > before[0])
    mine.set(film, [instant, rating])
}

/** ratings.csv split: the drawn users' ratings, measured like Pessoas, and
 * everyone else's 4+ votes. */
const splitRatings = (
  ratingsCsv: string,
  drawing: ReturnType<typeof drawUsers>,
  sourceDate: readonly [string, string],
): Sample => {
  const { films, drawn } = drawing
  const imdbs = [...new Set(films.values())].sort((a, b) =>
    compareTuple([a], [b]),
  )
  const columns = new Map(imdbs.map((imdb, i) => [imdb, i]))
  const outside = new OutsideVotes()
  const byUser = new Map<number, Map<string, readonly [number, number]>>()
  for (const [userId, movieId, rawRating, rawInstant] of csvColumns(
    ratingsCsv,
    RATING_COLUMNS,
  )) {
    const film = films.get(int(movieId))
    if (film === undefined) continue
    const user = int(userId)
    const rating = pyParseFloat(rawRating)
    if (drawn.has(user)) {
      const instant = int(rawInstant)
      let mine = byUser.get(user)
      if (mine === undefined) {
        mine = new Map()
        byUser.set(user, mine)
      }
      keepLatest(mine, film, instant, rating)
    } else if (rating >= HIGH_RATING) outside.push(user, columns.get(film)!)
  }
  const measured: MeasuredPerson[] = []
  for (const user of [...byUser.keys()].sort((a, b) => a - b)) {
    const person = sampledPerson(user, byUser.get(user)!, sourceDate[0])
    if (person) measured.push(person)
  }
  return {
    measured,
    users: drawn,
    films,
    votes: outside.pairs(imdbs),
    sourceAndDate: sourceDate,
  }
}

/** `ler`: the sample, or `null` when the Catalog has neither ratings.csv
 * nor links.csv. */
export const readSample = (
  folder: string,
  manifest: string,
  progress: Progress,
): Effect.Effect<Sample | null, EngineError> =>
  Effect.gen(function* () {
    const ratingsCsv = join(folder, 'ratings.csv')
    const linksCsv = join(folder, 'links.csv')
    const hasRatings = isFile(ratingsCsv)
    const hasLinks = isFile(linksCsv)
    if (!hasRatings && !hasLinks) return null
    if (!hasRatings || !hasLinks)
      return yield* engineError(
        'invalid_data',
        `${folder}: são necessários ratings.csv e links.csv para avaliar o MovieLens`,
      )
    const sourceDate = yield* sourceAndDate(manifest, MOVIELENS_DUMP)
    const fail = (error: unknown) =>
      engineError('invalid_data', `${folder}: ${reason(error)}`)
    const drawing = yield* Effect.try({
      try: () => drawUsers(linksCsv, ratingsCsv),
      catch: fail,
    })
    yield* progress(14, 'Separando as Notas de treino e da amostra')
    return yield* Effect.try({
      try: () => splitRatings(ratingsCsv, drawing, sourceDate),
      catch: fail,
    })
  })

const insertMany = (
  db: Connection,
  sql: string,
  rows: Iterable<ReadonlyArray<string | number>>,
): Effect.Effect<void, SqliteError> =>
  Effect.gen(function* () {
    for (const row of rows) yield* db.run(sql, ...row)
  })

/** The TEMP `vizinhos` from the votes outside the sample, only for films
 * someone uses as a seed. */
const sampleNeighbors = (db: Connection, sample: Sample, progress: Progress) =>
  Effect.gen(function* () {
    const seeds = new Set(
      (yield* db.all(
        'SELECT DISTINCT n.filme_id FROM notas_vigentes n JOIN filmes f ON f.id = n.filme_id WHERE n.nota >= 3',
      )).map((row) => text(row, 'filme_id')),
    )
    const { films, items, users } = sample.votes
    const rows = films.flatMap((film, i) => (seeds.has(film) ? [i] : []))
    const batches: Array<readonly [number, number]> = []
    const pairs = [
      ...computeNeighbors(films, items, users, {
        seeds: rows,
        onBatch: (done, total) => batches.push([done, total]),
      }),
    ]
    for (const [done, total] of batches)
      yield* progress(
        20 + Math.floor((14 * done) / total),
        'Calculando vizinhos sem os usuários sorteados',
      )
    yield* insertMany(
      db,
      'INSERT INTO vizinhos (fato_id, filme_id, vizinho_id, base, ambos, fonte, data) VALUES (?, ?, ?, ?, ?, ?, ?)',
      reviewFacts('vizinhos', pairs, sample.sourceAndDate),
    )
  })

/** The TEMP `tags_movielens` without the sampled users' tags. */
const sampleTags = (
  db: Connection,
  folder: string,
  sample: Sample,
  progress: Progress,
) =>
  Effect.gen(function* () {
    const tagsCsv = join(folder, 'tags.csv')
    if (!isFile(tagsCsv)) return
    yield* progress(34, 'Contando as tags dos usuários de treino')
    const counted = yield* Effect.try({
      try: () => {
        const lines = [...csvColumns(tagsCsv, ['userId', 'movieId', 'tag'])]
        const map = new Map(
          [...sample.films].map(([id, film]) => [String(id), film]),
        )
        return countTags(lines, map, sample.users)
      },
      catch: (error) =>
        engineError('invalid_data', `${tagsCsv}: ${reason(error)}`),
    })
    yield* insertMany(
      db,
      'INSERT INTO tags_movielens (fato_id, filme_id, tag, usuarios, fonte, data) VALUES (?, ?, ?, ?, ?, ?)',
      reviewFacts('tags_movielens', counted, sample.sourceAndDate),
    )
  })

/** `preparar`: TEMP `vizinhos` from the votes outside the sample (only for
 * films someone uses as a seed), TEMP `tags_movielens` without the sampled
 * users, and a TEMP view of the taste neighbours' MovieLens ratings
 * without them either (#174): a sampled user would otherwise be his own
 * closest neighbour, held-out films included. Runs after the offline views, since the seeds come from
 * the TEMP `notas_vigentes`. The similarity's tag rarities and norms are
 * computed again over those tags (#171: the top 5's similarity reads
 * them), with the rebuild's own step, into TEMP tables. */
export const prepareSample = (
  db: Connection,
  folder: string,
  sample: Sample,
  progress: Progress,
): Effect.Effect<void, EngineError | SqliteError, Environment> =>
  Effect.gen(function* () {
    yield* db.exec(
      'CREATE TEMP TABLE usuarios_sorteados (usuario INTEGER PRIMARY KEY)',
    )
    yield* insertMany(
      db,
      'INSERT INTO usuarios_sorteados VALUES (?)',
      [...sample.users].map((user) => [user]),
    )
    yield* db.exec(`
      CREATE TEMP VIEW notas_gosto_movielens AS
      SELECT g.* FROM main.notas_gosto_movielens g
      WHERE g.usuario NOT IN (SELECT usuario FROM usuarios_sorteados)
    `)
    yield* db.exec(`
      CREATE TEMP TABLE vizinhos AS SELECT * FROM main.vizinhos WHERE 0;
      CREATE INDEX temp.vizinhos_por_filme ON vizinhos(filme_id);
    `)
    yield* sampleNeighbors(db, sample, progress)
    yield* db.exec(`
      CREATE TEMP TABLE tags_movielens AS SELECT * FROM main.tags_movielens WHERE 0;
      CREATE INDEX temp.tags_por_tag ON tags_movielens(tag);
    `)
    yield* sampleTags(db, folder, sample, progress)
    yield* db.exec(`
      CREATE TEMP TABLE tags_no_catalogo AS SELECT * FROM main.tags_no_catalogo WHERE 0;
      CREATE TEMP TABLE normas_tags_movielens AS SELECT * FROM main.normas_tags_movielens WHERE 0;
    `)
    yield* similarity.load(db)
  })
