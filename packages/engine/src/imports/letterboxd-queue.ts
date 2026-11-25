// The Letterboxd resolution queue, shared by every Pessoa (`importar/
// fila.py`): what waits there (`fila ver`, with TMDB's cached candidates)
// and the Dono's decisions (`fila confirmar`, `fila descartar`), recorded
// in imports/letterboxd.md. `fila reprocessar` is `reprocessLetterboxd`.

import { Effect } from 'effect'
import { pyInt } from '../compat/fact-id.ts'
import { pyStrip } from '../compat/text.ts'
import { DataWriter, type Author } from '../data/DataWriter.ts'
import type { GitError } from '../data/git.ts'
import { yamlToJson, type YamlValue } from '../data/yaml.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import type { Environment } from '../runtime/Environment.ts'
import { Run } from '../runtime/Run.ts'
import { Sqlite, type Connection, type SqliteError } from '../sqlite/Sqlite.ts'
import { TMDB_ATTRIBUTION, Tmdb } from '../sources/Tmdb.ts'
import {
  ensureLetterboxdTables,
  loadLetterboxd,
  moviesTitled,
  queueCandidate,
  type QueueCandidate,
} from './letterboxd.ts'
import {
  readResolutions,
  saveResolutions,
  statusOf,
  type Resolution,
} from './letterboxd-resolutions.ts'

/** A film waiting in the queue, and the Pessoas who have it. */
export interface QueueItem {
  readonly id: string
  readonly name: string
  readonly year: number | null
  readonly reason: string | null
  readonly people: readonly string[]
  /** TMDB's films with the title, when an earlier search cached them. */
  readonly candidates: readonly QueueCandidate[]
}

export interface QueueView {
  readonly items: readonly QueueItem[]
  readonly attributions: readonly (typeof TMDB_ATTRIBUTION)[]
}

const text = (value: unknown): string | null =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : null

/** The queue (`fila ver`): offline, the candidates only from the cache. */
export const viewQueue: Effect.Effect<
  QueueView,
  EngineError | SqliteError,
  Environment | Sqlite | Run | Tmdb
> = Effect.gen(function* () {
  const rows = yield* (yield* Sqlite).read((db) =>
    db.all(
      "SELECT id, nome, ano, pessoa, razao FROM itens_letterboxd WHERE situacao = 'fila' ORDER BY nome, ano, id, pessoa",
    ),
  )
  const items = new Map<string, QueueItem & { people: string[] }>()
  for (const row of rows) {
    const id = String(row.id)
    let found = items.get(id)
    if (found === undefined) {
      found = {
        id,
        name: String(row.nome),
        year: row.ano === null ? null : Number(row.ano),
        reason: text(row.razao),
        people: [],
        candidates: [],
      }
      items.set(id, found)
    }
    found.people.push(String(row.pessoa))
  }
  const tmdb = yield* Tmdb
  const all = []
  for (const found of items.values()) {
    if (found.year === null) {
      all.push(found)
      continue
    }
    const films = yield* moviesTitled(tmdb.cachedMovies, found.name, found.year)
    all.push({ ...found, candidates: (films ?? []).map(queueCandidate) })
  }
  return {
    items: all,
    attributions: all.some((i) => i.candidates.length > 0)
      ? [TMDB_ATTRIBUTION]
      : [],
  }
})

/** A decision of the Dono on a queued film, as `fila confirmar` and `fila
 * descartar` answer it: what imports/letterboxd.md records (`film` and
 * `input` when confirmed, `discardReason` when discarded), plus whether it
 * is new. */
export interface QueueDecision {
  readonly id: string
  readonly name: string
  readonly year: number | null
  readonly date: string
  readonly source: string
  readonly kind: string
  readonly status: string
  readonly film?: string
  readonly input?: string
  readonly discardReason?: string
  readonly new: boolean
  readonly attributions?: readonly (typeof TMDB_ATTRIBUTION)[]
}

/** The output names of the record's keys. */
const OUTPUT_KEYS: Readonly<Record<string, string>> = {
  discard_reason: 'discardReason',
}

const decisionJson = (resolution: Resolution): Record<string, unknown> =>
  Object.fromEntries(
    [...resolution].map(([key, value]) => [
      OUTPUT_KEYS[key] ?? key,
      yamlToJson(value),
    ]),
  )

type Decided =
  | { readonly film: string; readonly reason?: undefined }
  | { readonly film?: undefined; readonly reason: string }

const IMDB =
  /^(?:https:\/\/(?:www\.)?imdb\.com\/title\/)?(tt[0-9]+)\/?(?:[?#].*)?$/
const TMDB_MOVIE =
  /^https:\/\/(?:www\.)?themoviedb\.org\/movie\/([0-9]+)(?:-[^/?#]+)?\/?(?:[?#].*)?$/

/** The tconst the Dono's input names, and the attributions it took
 * (`_filme`): a tconst or an IMDb link as it is; a TMDB link by the
 * Catalog's Wikidata when it names one tconst, otherwise by asking TMDB. */
const filmOf = (
  db: Connection,
  input: string,
): Effect.Effect<
  { readonly film: string; readonly usedTmdb: boolean },
  EngineError | SqliteError,
  Run | Tmdb
> =>
  Effect.gen(function* () {
    const imdb = IMDB.exec(input)
    if (imdb?.[1] !== undefined) return { film: imdb[1], usedTmdb: false }
    const tmdbId = TMDB_MOVIE.exec(input)?.[1]
    if (tmdbId === undefined)
      return yield* engineError(
        'invalid_usage',
        'use um tconst (tt...) ou um link de filme do IMDb ou do TMDB',
      )
    const ids = yield* db.all(
      'SELECT DISTINCT imdb FROM slugs_letterboxd WHERE tmdb = ? AND imdb IS NOT NULL ORDER BY imdb',
      tmdbId,
    )
    const [only] = ids
    if (ids.length === 1 && only !== undefined)
      return { film: String(only.imdb), usedTmdb: false }
    const converted = yield* (yield* Tmdb).imdbId(tmdbId)
    if (converted) return { film: converted, usedTmdb: true }
    const [warning] = yield* (yield* Run).warnings
    return yield* engineError(
      'film_without_imdb',
      `${warning ?? 'o TMDB não devolveu um ID do IMDb'}. Use o tconst ou o link do IMDb para confirmar.`,
    )
  })

/** Records the Dono's decision on a queued film and reloads the Letterboxd
 * Fatos (`decidir`). The same decision again answers what was recorded,
 * with `new: false`. */
const decide = (
  id: string,
  decided: Decided,
  author: Author,
): Effect.Effect<
  QueueDecision,
  EngineError | SqliteError | GitError,
  Environment | Sqlite | Run | Tmdb | DataWriter
> =>
  Effect.gen(function* () {
    const writer = yield* DataWriter
    const action = decided.film === undefined ? 'discard' : 'confirm'
    return yield* writer.write(
      { author, message: `letterboxd queue ${action} ${id}` },
      (db) =>
        Effect.gen(function* () {
          yield* ensureLetterboxdTables(db)
          const item = yield* db.get(
            "SELECT nome, ano FROM itens_letterboxd WHERE id = ? AND situacao = 'fila' LIMIT 1",
            id,
          )
          const resolutions = yield* readResolutions
          if (item === undefined) {
            const earlier = resolutions.get(id)
            const same =
              earlier !== undefined &&
              (decided.film === undefined
                ? statusOf(earlier) === 'discarded' &&
                  earlier.get('discard_reason') === decided.reason
                : earlier.get('input') === decided.film)
            if (same)
              return {
                ...decisionJson(earlier),
                new: false,
              } as unknown as QueueDecision
            return yield* engineError(
              'item_not_queued',
              `'${id}' não está na fila; consulte \`fila ver\``,
            )
          }
          const year = item.ano === null ? null : Number(item.ano)
          const fields: [string, YamlValue][] = [
            ['id', id],
            ['name', String(item.nome)],
            ['year', year === null ? null : pyInt(year)],
            ['date', (yield* Run).today],
            ['source', 'Dono'],
            ['kind', 'stated'],
          ]
          let usedTmdb = false
          if (decided.film === undefined) {
            const reason = pyStrip(decided.reason)
            if (!reason)
              return yield* engineError(
                'invalid_usage',
                'informe a razão do descarte',
              )
            fields.push(['status', 'discarded'], ['discard_reason', reason])
          } else {
            const found = yield* filmOf(db, decided.film)
            usedTmdb = found.usedTmdb
            fields.push(
              ['status', 'confirmed'],
              ['film', found.film],
              ['input', decided.film],
            )
          }
          const resolution: Resolution = new Map(fields)
          resolutions.set(id, resolution)
          yield* loadLetterboxd(db, resolutions)
          yield* saveResolutions(resolutions)
          return {
            ...decisionJson(resolution),
            new: true,
            attributions: usedTmdb ? [TMDB_ATTRIBUTION] : [],
          } as unknown as QueueDecision
        }),
    )
  })

/** The Dono says which film a queued item is (`fila confirmar`): a tconst,
 * or an IMDb or TMDB film link. */
export const confirmQueueItem = (input: {
  readonly id: string
  readonly film: string
  readonly author: Author
}) => decide(input.id, { film: input.film }, input.author)

/** The Dono discards a queued item (`fila descartar`), with the reason
 * ("não é filme", "ignorar"). */
export const discardQueueItem = (input: {
  readonly id: string
  readonly reason: string
  readonly author: Author
}) => decide(input.id, { reason: input.reason }, input.author)
