// The Letterboxd import (`importar/letterboxd.py`): from a Pessoa's export
// (or the RSS copies #100 keeps) to Fatos in the database.
//
// The resolution chain of each film (Name, Year):
//
// 1. The Dono's decision in the queue (`confirmed` or `discarded` in
//    imports/letterboxd.md).
// 2. When the RSS gave the TMDB id: the Wikidata item with that id in P4947,
//    or TMDB's answer for that id recorded in imports/letterboxd.md.
// 3. Wikidata: `slug(Name)` and `slug(Name)-Year` in P6127, taking the item
//    whose earliest P577 falls in Year ± 1; on a tie, the slug with the year
//    wins. An item with only a TMDB series id is a miniseries and goes.
// 4. TMDB, as imports/letterboxd.md recorded its last answer.
// 5. The rest waits in the queue.
//
// `importLetterboxd` asks TMDB for what reaches step 4 and records the
// answers. `loadLetterboxd` (the rebuild, and every change to an import)
// only reads what is recorded, offline.
//
// Fatos, all with a `letterboxd:...` fato_id and Fonte "Letterboxd de
// <name>": Nota (ratings, and the diary's and review's Nota on the day she
// watched), Já visto (watched and diary), Declarado específico (each
// review's text and each tag, dated the day she watched) and watchlist. The
// RSS gives only Já visto and Nota, with Fonte "RSS do Letterboxd de
// <name>". The fato_id does not depend on the origin: the same diary entry
// in the RSS and in the ZIP is one Fato, and the ZIP's Fonte wins.

import { basename } from 'node:path'
import { Effect } from 'effect'
import { factId, pyFloat, pyInt, type PyValue } from '../compat/fact-id.ts'
import { casefold, isalnum, letterboxdSlug } from '../compat/text.ts'
import { DataWriter, type Author } from '../data/DataWriter.ts'
import type { GitError } from '../data/git.ts'
import { isPyFloat, isPyInt, pyTruthy, type YamlValue } from '../data/yaml.ts'
import { readPeople, resolvePerson } from '../people/people.ts'
import type { Person } from '../people/Person.ts'
import { engineError, EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import { Run } from '../runtime/Run.ts'
import { Sqlite, type Connection, type SqliteError } from '../sqlite/Sqlite.ts'
import { field, truthy } from '../sources/json.ts'
import { TMDB_ATTRIBUTION, Tmdb } from '../sources/Tmdb.ts'
import {
  filmKey,
  readLetterboxdExport,
  rowDay,
  rowKey,
  RSS_FILE,
  type LetterboxdRow,
} from './letterboxd-export.ts'
import {
  readResolutions,
  saveResolutions,
  statusOf,
  textField,
  type Resolution,
  type Resolutions,
} from './letterboxd-resolutions.ts'
import { readLetterboxdRss } from './letterboxd-rss.ts'
import { storedImports, storeImport } from './stored.ts'

/** The kinds of a Pessoa's `imports:` records this module reads. */
export const LETTERBOXD_KIND = 'letterboxd'
export const LETTERBOXD_RSS_KIND = 'letterboxd-rss'

/** How a film was resolved (`caminho` in the database). */
export const RESOLUTION_PATHS = ['wikidata', 'tmdb', 'manual'] as const
export type ResolutionPath = (typeof RESOLUTION_PATHS)[number]

/** The tables with the import's Fatos, by their database names. */
const FACT_TABLES = ['notas', 'ja_visto', 'declarados', 'watchlist'] as const
type FactTable = (typeof FACT_TABLES)[number]

/** A film's state in `itens_letterboxd.situacao` (the database's values). */
type ItemStatus = 'resolvido' | 'descartado' | 'fila'

interface Outcome {
  readonly status: ItemStatus
  readonly path: ResolutionPath | null
  readonly filmId: string | null
  readonly reason: string | null
  readonly tmdbId: string | null
}

const outcome = (
  status: ItemStatus,
  fields: Partial<Omit<Outcome, 'status'>> = {},
): Outcome => ({
  status,
  path: fields.path ?? null,
  filmId: fields.filmId ?? null,
  reason: fields.reason ?? null,
  tmdbId: fields.tmdbId ?? null,
})

type Services = Environment | Sqlite | Run

/** Runs a function that throws the `EngineError` Python raised. */
const attempt = <A>(f: () => A): Effect.Effect<A, EngineError> =>
  Effect.suspend(() => {
    try {
      return Effect.succeed(f())
    } catch (error) {
      if (error instanceof EngineError) return Effect.fail(error)
      throw error
    }
  })

/** Python's `if decisao` on a decision. */
const present = (
  resolution: Resolution | undefined,
): resolution is Resolution => resolution !== undefined && resolution.size > 0

const asText = (value: unknown): string | null =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'bigint'
    ? String(value)
    : null

// --- the chain ----------------------------------------------------------------

/** The film a TMDB id gives offline: by Wikidata's P4947 when it points to
 * one tconst, or by TMDB's answer for that same id (`pelo_id_do_tmdb`). */
const byTmdbId = (
  db: Connection,
  tmdbId: string,
  resolution: Resolution | undefined,
): Effect.Effect<Outcome | null, SqliteError> =>
  Effect.gen(function* () {
    const rows = yield* db.all(
      `SELECT imdb FROM slugs_letterboxd WHERE tmdb = ? AND imdb IS NOT NULL
       UNION SELECT i.valor FROM metadados_wikidata t
       JOIN metadados_wikidata i ON i.item = t.item AND i.propriedade = 'P345'
       WHERE t.propriedade = 'P4947' AND t.valor = ?
       ORDER BY 1`,
      tmdbId,
      tmdbId,
    )
    const imdbs = new Set(rows.map((row) => asText(row.imdb)))
    const [only] = imdbs
    if (imdbs.size === 1 && only !== undefined && only !== null)
      return outcome('resolvido', { path: 'wikidata', filmId: only })
    if (
      present(resolution) &&
      statusOf(resolution) === 'tmdb' &&
      (textField(resolution, 'tmdb') ?? 'None') === tmdbId
    )
      return outcome('resolvido', {
        path: 'tmdb',
        filmId: textField(resolution, 'film'),
      })
    return null
  })

/** Wikidata's P6127 within Year ± 1; on a tie, the slug with the year. */
const byWikidata = (
  db: Connection,
  name: string,
  year: number,
): Effect.Effect<Outcome | null, SqliteError> =>
  Effect.gen(function* () {
    const base = letterboxdSlug(name)
    if (!base) return null
    const withYear = `${base}-${year}`
    const rows = yield* db.all(
      `SELECT slug, item, imdb, tmdb, tmdb_serie FROM slugs_letterboxd
       WHERE slug IN (?, ?) AND ano BETWEEN ? AND ? ORDER BY item`,
      base,
      withYear,
      year - 1,
      year + 1,
    )
    let items = new Map(rows.map((row) => [row.item, row]))
    if (items.size > 1)
      items = new Map(
        rows
          .filter((row) => row.slug === withYear)
          .map((row) => [row.item, row]),
      )
    if (items.size !== 1) return null
    const [item] = items.values()
    if (item === undefined) return null
    if (item.tmdb_serie && !item.tmdb)
      return outcome('descartado', {
        path: 'wikidata',
        reason: `minissérie (${asText(item.item)} só tem ID de série no TMDB)`,
      })
    if (item.imdb)
      return outcome('resolvido', {
        path: 'wikidata',
        filmId: asText(item.imdb),
      })
    return outcome('fila', { tmdbId: asText(item.tmdb) })
  })

const NO_YEAR = 'o export não traz o ano do filme'
const MINISERIES =
  'minissérie (no TMDB, a série com esse título tem mais votos que qualquer filme)'
const NOT_ASKED =
  'o Wikidata não deu um ID do IMDb, e o TMDB ainda não respondeu (`fila reprocessar` tenta de novo)'

/** Resolves offline: the Dono, the TMDB id, Wikidata, what TMDB already
 * answered, the queue (`resolver`). */
const resolve = (
  db: Connection,
  name: string,
  year: number | null,
  resolution: Resolution | undefined,
  tmdbId: string | null = null,
): Effect.Effect<Outcome, SqliteError> =>
  Effect.gen(function* () {
    const status = present(resolution) ? statusOf(resolution) : undefined
    if (status === 'confirmed' && resolution)
      return outcome('resolvido', {
        path: 'manual',
        filmId: textField(resolution, 'film'),
      })
    if (status === 'discarded' && resolution) {
      const reason = resolution.get('discard_reason')
      return outcome('descartado', {
        path: 'manual',
        reason:
          reason !== undefined && pyTruthy(reason)
            ? textField(resolution, 'discard_reason')
            : 'descartado pelo Dono',
      })
    }
    if (tmdbId) {
      const found = yield* byTmdbId(db, tmdbId, resolution)
      if (found) return found
    }
    if (year === null) return outcome('fila', { reason: NO_YEAR })
    const found = yield* byWikidata(db, name, year)
    if (found && found.status !== 'fila') return found
    const itemTmdb = found ? found.tmdbId : null
    if (status === 'tmdb' && resolution)
      return outcome('resolvido', {
        path: 'tmdb',
        filmId: textField(resolution, 'film'),
      })
    if (status === 'miniseries')
      return outcome('descartado', { path: 'tmdb', reason: MINISERIES })
    if (status === 'pending' && resolution)
      return outcome('fila', {
        reason: textField(resolution, 'discard_reason'),
        tmdbId: itemTmdb,
      })
    return outcome('fila', { reason: NOT_ASKED, tmdbId: itemTmdb })
  })

// --- TMDB ---------------------------------------------------------------------

/** A title without case, accents or punctuation. */
const titleKey = (title: string): string =>
  Array.from(casefold(title).normalize('NFKD'))
    .filter((char) => isalnum(char))
    .join('')

const sameTitle = (
  name: string,
  result: unknown,
  ...fields: string[]
): boolean => {
  const wanted = titleKey(name)
  return (
    wanted !== '' &&
    fields.some((key) => {
      const value = field(result, key)
      return wanted === titleKey(truthy(value) ? String(value) : '')
    })
  )
}

const votes = (result: unknown): number => {
  const count = field(result, 'vote_count')
  return truthy(count) ? Number(count) : 0
}

/** A short film: under 40 minutes and 10 votes. */
const SHORT_MINUTES = 40
const SHORT_VOTES = 10

type TmdbService = Tmdb['Service']
type SourceError = EngineError | SqliteError

/** The films titled as the name, in the year, then in year ± 1; null when
 * TMDB stopped answering (`filmes_com_mesmo_titulo`). */
const moviesTitled = (
  tmdb: TmdbService,
  name: string,
  year: number,
): Effect.Effect<unknown[] | null, SourceError, Run> =>
  Effect.gen(function* () {
    for (const years of [[year], [year - 1, year + 1]]) {
      const same = new Map<unknown, unknown>()
      for (const tried of years) {
        const results = yield* tmdb.movies(name, tried)
        if (results === undefined) return null
        for (const film of results)
          if (sameTitle(name, film, 'title', 'original_title'))
            same.set(field(film, 'id'), film)
      }
      if (same.size > 0) return [...same.values()]
    }
    return []
  })

/** The candidates without the shorts, when any is left; null when TMDB
 * stopped answering. The runtime is asked only for those with few votes. */
const withoutShorts = (
  tmdb: TmdbService,
  candidates: unknown[],
): Effect.Effect<unknown[] | null, SourceError, Run> =>
  Effect.gen(function* () {
    if (candidates.length < 2) return candidates
    const features = []
    for (const film of candidates) {
      if (votes(film) < SHORT_VOTES) {
        const runtime = yield* tmdb.runtime(
          field(film, 'id') as string | number,
        )
        if (runtime === undefined && (yield* tmdb.searchDisabled)) return null
        if (runtime && runtime < SHORT_MINUTES) continue
      }
      features.push(film)
    }
    return features.length > 0 ? features : candidates
  })

/** The fields every recorded answer starts with (`_decisao`). */
const answerBase = (
  name: string,
  year: number | null,
  today: string,
): [string, YamlValue][] => [
  ['id', filmKey(name, year)],
  ['name', name],
  ['year', year === null ? null : pyInt(year)],
  ['date', today],
]

/** The decision TMDB's search gives the film, or null when TMDB did not
 * answer (`consultar_tmdb`).
 *
 * It takes one film with the same title (ignoring case, accents and
 * punctuation), first in the year, then in year ± 1. A short with almost no
 * votes leaves the candidates when another is left. A series with the title
 * in the year and more votes than every film is a miniseries. More than one
 * film goes to the queue with the candidates. */
const askTmdb = (
  tmdb: TmdbService,
  name: string,
  year: number,
  tmdbId: string | null,
): Effect.Effect<Resolution | null, SourceError, Run> =>
  Effect.gen(function* () {
    const base = answerBase(name, year, (yield* Run).today)
    const answer = (...more: [string, YamlValue][]) =>
      new Map([...base, ...more])
    if (tmdbId) {
      const imdb = yield* tmdb.imdbId(tmdbId)
      if (imdb) return answer(['status', 'tmdb'], ['film', imdb])
      if (yield* tmdb.searchDisabled) return null
    }
    const titled = yield* moviesTitled(tmdb, name, year)
    if (titled === null) return null
    const same = yield* withoutShorts(tmdb, titled)
    if (same === null) return null
    const series = yield* tmdb.series(name, year)
    if (series === undefined) return null
    const seriesVotes = series
      .filter((s) => sameTitle(name, s, 'name', 'original_name'))
      .map(votes)
    if (
      seriesVotes.length > 0 &&
      Math.max(...seriesVotes) > Math.max(-1, ...same.map(votes))
    )
      return answer(['status', 'miniseries'])
    const [only] = same
    if (same.length === 1) {
      const imdb = yield* tmdb.imdbId(field(only, 'id') as string | number)
      if (imdb) return answer(['status', 'tmdb'], ['film', imdb])
      if (yield* tmdb.searchDisabled) return null
      return answer(
        ['status', 'pending'],
        ['discard_reason', 'o TMDB achou o filme, mas sem ID do IMDb'],
      )
    }
    if (same.length > 0)
      return answer(
        ['status', 'pending'],
        ['discard_reason', 'o TMDB achou mais de um filme com esse título'],
      )
    return answer(
      ['status', 'pending'],
      ['discard_reason', 'nem o Wikidata nem o TMDB acharam o filme'],
    )
  })

/** The decision the RSS's TMDB id gives the film, or null without a tconst
 * or an answer (`consultar_id_do_tmdb`). */
const askTmdbId = (
  tmdb: TmdbService,
  name: string,
  year: number | null,
  tmdbId: string,
): Effect.Effect<Resolution | null, SourceError, Run> =>
  Effect.gen(function* () {
    const imdb = yield* tmdb.imdbId(tmdbId)
    if (!imdb) return null
    return new Map<string, YamlValue>([
      ...answerBase(name, year, (yield* Run).today),
      ['status', 'tmdb'],
      ['film', imdb],
      ['tmdb', tmdbId],
    ])
  })

/** Python's `!=` between a recorded value and a new one. */
const differs = (
  recorded: YamlValue | undefined,
  value: YamlValue,
): boolean => {
  const number = (v: YamlValue | undefined) =>
    isPyInt(v)
      ? Number(v.int)
      : isPyFloat(v)
        ? v.float
        : typeof v === 'boolean'
          ? Number(v)
          : undefined
  const a = number(recorded)
  const b = number(value)
  if (a !== undefined || b !== undefined) return a !== b
  return (recorded ?? null) !== value
}

/** Asks TMDB for what the offline chain leaves in the queue and records the
 * answers in imports/letterboxd.md (`_registrar_respostas_do_tmdb`).
 * Returns the decisions and whether TMDB answered anything. */
const recordTmdbAnswers = (
  db: Connection,
  rows: readonly LetterboxdRow[],
): Effect.Effect<
  { readonly resolutions: Resolutions; readonly usedTmdb: boolean },
  SourceError,
  Services | Tmdb
> =>
  Effect.gen(function* () {
    const resolutions = yield* readResolutions
    const tmdb = yield* Tmdb
    let usedTmdb = false
    let changed = false
    for (const [id, filmRows] of byFilm(rows)) {
      const [row] = filmRows
      if (row === undefined) continue
      const tmdbId = tmdbIdOf(filmRows)
      const resolution = resolutions.get(id)
      const status = present(resolution) ? statusOf(resolution) : undefined
      let answer: Resolution | null = null
      const byOwner = status === 'confirmed' || status === 'discarded'
      if (tmdbId && !byOwner && !(yield* byTmdbId(db, tmdbId, resolution)))
        answer = yield* askTmdbId(tmdb, row.name, row.year, tmdbId)
      if (answer === null) {
        const found = yield* resolve(db, row.name, row.year, resolution, tmdbId)
        if (found.status !== 'fila' || row.year === null) continue
        answer = yield* askTmdb(tmdb, row.name, row.year, found.tmdbId)
      }
      if (answer !== null) {
        usedTmdb = true
        const fresh = answer
        if (
          !present(resolution) ||
          [...fresh].some(
            ([key, value]) =>
              key !== 'date' && differs(resolution.get(key), value),
          )
        ) {
          resolutions.set(id, fresh)
          changed = true
        }
      }
    }
    if (changed) yield* saveResolutions(resolutions)
    return { resolutions, usedTmdb }
  })

// --- the load -----------------------------------------------------------------

/** The rows by film, in the order they first appear (`_por_filme`). */
const byFilm = (
  rows: readonly LetterboxdRow[],
): Map<string, LetterboxdRow[]> => {
  const films = new Map<string, LetterboxdRow[]>()
  for (const row of rows) {
    const key = rowKey(row)
    const list = films.get(key)
    if (list) list.push(row)
    else films.set(key, [row])
  }
  return films
}

/** The TMDB id some row of the film has (only the RSS has it). */
const tmdbIdOf = (rows: readonly LetterboxdRow[]): string | null =>
  rows.find((row) => row.tmdb)?.tmdb ?? null

/** The rows of the Pessoa's ZIPs, then those of her RSS copies, so the
 * ZIP's Fonte wins on a repeated Fato (`linhas_da_pessoa`). */
export const personLetterboxdRows = (
  person: Person,
): Effect.Effect<LetterboxdRow[], EngineError, Environment> =>
  Effect.gen(function* () {
    const zips = yield* storedImports(
      person,
      LETTERBOXD_KIND,
      (path, content) =>
        attempt(() => readLetterboxdExport(basename(path), content)),
    )
    const feeds = yield* storedImports(
      person,
      LETTERBOXD_RSS_KIND,
      (path, content) =>
        attempt(() => readLetterboxdRss(basename(path), content)),
    )
    return [...zips.flat(), ...feeds.flat()]
  })

const insertFacts = (
  db: Connection,
  slug: string,
  source: string,
  film: string,
  row: LetterboxdRow,
): Effect.Effect<void, SqliteError> =>
  Effect.gen(function* () {
    const insert = (
      table: FactTable,
      columns: readonly string[],
      values: readonly PyValue[],
    ) => {
      const id = factId(LETTERBOXD_KIND, table, slug, film, ...values)
      const target = table === 'declarados' ? 'alvo' : 'filme_id'
      const params = values.map((v) =>
        typeof v === 'object' && v !== null
          ? 'float' in v
            ? v.float
            : v.int
          : v,
      )
      return db.run(
        `INSERT INTO ${table} (fato_id, pessoa, ${target}, fonte, ${columns.join(', ')}) ` +
          `VALUES (?, ?, ?, ?, ${columns.map(() => '?').join(', ')}) ON CONFLICT(fato_id) DO NOTHING`,
        id,
        slug,
        film,
        source,
        ...params.map((p) => (typeof p === 'boolean' ? Number(p) : p)),
      )
    }
    if (row.file === 'watchlist') {
      yield* insert('watchlist', ['data'], [row.date])
      return
    }
    if (row.file === 'ratings') {
      if (row.rating !== null)
        yield* insert(
          'notas',
          ['data', 'nota'],
          [row.date, pyFloat(row.rating)],
        )
      return
    }
    const day = rowDay(row)
    yield* insert('ja_visto', ['data', 'tipo'], [day, 'declarado'])
    if (
      (row.file === 'diary' ||
        row.file === 'reviews' ||
        row.file === RSS_FILE) &&
      row.rating !== null
    )
      yield* insert('notas', ['data', 'nota'], [day, pyFloat(row.rating)])
    const said = [
      ...(row.review ? [row.review] : []),
      ...row.tags.map((t) => `tag: ${t}`),
    ]
    for (const text of said)
      yield* insert(
        'declarados',
        ['data', 'especifico', 'rotulo', 'texto'],
        [day, pyInt(1), row.name, text],
      )
  })

const loadPerson = (
  db: Connection,
  person: Person,
  rows: readonly LetterboxdRow[],
  resolutions: Resolutions,
): Effect.Effect<void, SqliteError> =>
  Effect.gen(function* () {
    for (const [id, filmRows] of byFilm(rows)) {
      const [first] = filmRows
      if (first === undefined) continue
      const r = yield* resolve(
        db,
        first.name,
        first.year,
        resolutions.get(id),
        tmdbIdOf(filmRows),
      )
      yield* db.run(
        `INSERT INTO itens_letterboxd (pessoa, id, nome, ano, situacao, caminho, filme_id, razao)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        person.slug,
        id,
        first.name,
        first.year,
        r.status,
        r.path,
        r.filmId,
        r.reason,
      )
      if (r.status === 'resolvido' && r.filmId !== null)
        for (const row of filmRows)
          yield* insertFacts(
            db,
            person.slug,
            `${row.origin} de ${person.name}`,
            r.filmId,
            row,
          )
    }
  })

/** Redoes every Pessoa's Letterboxd Fatos in the database, offline
 * (`carregar`): the rebuild, and every change to an import. */
export const loadLetterboxd = (
  db: Connection,
  resolutions?: Resolutions,
): Effect.Effect<void, EngineError | SqliteError, Environment> =>
  Effect.gen(function* () {
    for (const table of FACT_TABLES)
      yield* db.run(`DELETE FROM ${table} WHERE fato_id LIKE 'letterboxd:%'`)
    yield* db.run('DELETE FROM itens_letterboxd')
    const decided = resolutions ?? (yield* readResolutions)
    for (const person of yield* readPeople) {
      const rows = yield* personLetterboxdRows(person)
      if (rows.length > 0) yield* loadPerson(db, person, rows, decided)
    }
  })

/** `loadLetterboxd` in its own write: what the app runs on start (E23). */
export const reloadLetterboxd: Effect.Effect<
  void,
  EngineError | SqliteError,
  Environment | Sqlite
> = Effect.flatMap(Sqlite, (sqlite) => sqlite.write((db) => loadLetterboxd(db)))

// --- the report ---------------------------------------------------------------

export interface ImportItem {
  readonly id: string
  readonly name: string
  readonly year: number | null
  readonly reason: string | null
}

export interface DiscardedItem extends ImportItem {
  readonly resolvedBy: ResolutionPath | null
}

export type CountsByPath = Readonly<Record<ResolutionPath, number>>

/** How many of the Pessoa's films each path resolved, which were discarded
 * and which wait in the queue (`relatorio`). */
export interface LetterboxdReport {
  readonly person: string
  readonly films: number
  readonly resolved: CountsByPath
  readonly discarded: CountsByPath
  readonly queued: number
  readonly queue: readonly ImportItem[]
  readonly discardedItems: readonly DiscardedItem[]
}

const PATHS_BY_DB: Readonly<Record<string, ResolutionPath>> = {
  wikidata: 'wikidata',
  tmdb: 'tmdb',
  manual: 'manual',
}

const item = (row: Record<string, unknown>): ImportItem => ({
  id: String(row.id),
  name: String(row.nome),
  year: row.ano === null ? null : Number(row.ano),
  reason: asText(row.razao),
})

export const letterboxdReport = (
  db: Connection,
  slug: string,
): Effect.Effect<LetterboxdReport, SqliteError> =>
  Effect.gen(function* () {
    const counted = yield* db.all(
      'SELECT situacao, caminho FROM itens_letterboxd WHERE pessoa = ? ORDER BY situacao, caminho, id',
      slug,
    )
    const count = (status: ItemStatus) =>
      Object.fromEntries(
        RESOLUTION_PATHS.map((path) => [
          path,
          counted.filter((r) => r.situacao === status && r.caminho === path)
            .length,
        ]),
      ) as CountsByPath
    const queue = (yield* db.all(
      "SELECT id, nome, ano, razao FROM itens_letterboxd WHERE pessoa = ? AND situacao = 'fila' ORDER BY id",
      slug,
    )).map(item)
    const discardedItems = (yield* db.all(
      "SELECT id, nome, ano, caminho, razao FROM itens_letterboxd WHERE pessoa = ? AND situacao = 'descartado' ORDER BY id",
      slug,
    )).map((row) => ({
      ...item(row),
      resolvedBy: PATHS_BY_DB[String(row.caminho)] ?? null,
    }))
    return {
      person: slug,
      films: counted.length,
      resolved: count('resolvido'),
      discarded: count('descartado'),
      queued: queue.length,
      queue,
      discardedItems,
    }
  })

// --- importing ------------------------------------------------------------------

export type FactCounts = Readonly<
  Record<'ratings' | 'seen' | 'stated' | 'watchlist', number>
>

const FACT_NAMES: Readonly<Record<FactTable, keyof FactCounts>> = {
  notas: 'ratings',
  ja_visto: 'seen',
  declarados: 'stated',
  watchlist: 'watchlist',
}

const countFacts = (
  db: Connection,
  slug: string,
): Effect.Effect<FactCounts, SqliteError> =>
  Effect.gen(function* () {
    const counts: Record<string, number> = {}
    for (const table of FACT_TABLES) {
      const row = yield* db.get(
        `SELECT count(*) AS n FROM ${table} WHERE pessoa = ? AND fato_id LIKE 'letterboxd:%'`,
        slug,
      )
      counts[FACT_NAMES[table]] = Number(row?.n ?? 0)
    }
    return counts as FactCounts
  })

export interface LetterboxdImport extends LetterboxdReport {
  /** The kept copy, relative to filmes-dados. */
  readonly file: string
  /** False when the same file had been imported before. */
  readonly newFile: boolean
  readonly facts: FactCounts
  readonly newFacts: FactCounts
  readonly warnings: readonly string[]
  readonly attributions: readonly (typeof TMDB_ATTRIBUTION)[]
}

export interface LetterboxdImportInput {
  /** Slug, name or alias; "dono" is the Dono. */
  readonly person: string
  /** The file's name as uploaded: the messages and the record show it. */
  readonly original: string
  /** The ZIP's bytes. */
  readonly content: Uint8Array
  /** Who asked: the commit's author. */
  readonly author: Author
}

/** Imports a Pessoa's Letterboxd export (`importar --letterboxd`): keeps
 * the ZIP, resolves its films, asks TMDB for what Wikidata did not resolve,
 * and reloads the Letterboxd Fatos. */
export const importLetterboxd = (
  input: LetterboxdImportInput,
): Effect.Effect<
  LetterboxdImport,
  EngineError | SqliteError | GitError,
  Services | Tmdb | DataWriter
> =>
  Effect.gen(function* () {
    const rows = yield* attempt(() =>
      readLetterboxdExport(input.original, input.content),
    )
    const writer = yield* DataWriter
    return yield* writer.write(
      {
        author: input.author,
        message: `import letterboxd ${input.person}: ${input.original}`,
      },
      (db) =>
        Effect.gen(function* () {
          const current = yield* db.get(
            "SELECT 1 FROM sqlite_master WHERE name = 'itens_letterboxd'",
          )
          if (current === undefined)
            return yield* engineError(
              'outdated_database',
              'o banco ainda não tem o import do Letterboxd. Rode `reconstruir`.',
            )
          const person = yield* resolvePerson(input.person)
          const before = yield* countFacts(db, person.slug)
          const { resolutions, usedTmdb } = yield* recordTmdbAnswers(db, [
            ...rows,
            ...(yield* personLetterboxdRows(person)),
          ])
          const stored = yield* storeImport(
            person,
            LETTERBOXD_KIND,
            input.original,
            input.content,
            'zip',
          )
          yield* loadLetterboxd(db, resolutions)
          const after = yield* countFacts(db, person.slug)
          const tmdbItem = yield* db.get(
            "SELECT 1 FROM itens_letterboxd WHERE pessoa = ? AND caminho = 'tmdb'",
            person.slug,
          )
          return {
            ...(yield* letterboxdReport(db, person.slug)),
            file: stored.file,
            newFile: stored.new,
            facts: after,
            newFacts: Object.fromEntries(
              Object.entries(after).map(([k, n]) => [
                k,
                n - before[k as keyof FactCounts],
              ]),
            ) as FactCounts,
            warnings: yield* (yield* Run).warnings,
            attributions:
              usedTmdb || tmdbItem !== undefined ? [TMDB_ATTRIBUTION] : [],
          }
        }),
    )
  })
