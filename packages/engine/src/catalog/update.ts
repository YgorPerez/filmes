// `atualizar` (`catalogo/atualizacao.py`): downloads the IMDb, Wikidata and
// GroupLens dumps and pins them in the versions manifest. Each dump lands in
// a temporary folder inside the catalog, is checked (a ZIP read to its end,
// the IMDb header, every SPARQL row), and moves to `<catalog>/<sha256>/
// <name>`. The manifest is replaced only when every dump is there, so a
// failure leaves the pinned versions as they were.
//
// With `FILMES_GRAVACOES`, the "network" is `<recordings>/catalogo/<name>`
// (without `.gz`): tests and the oracle never download.
//
// The gzip files are compressed by Node's zlib, so their bytes (and SHA-256)
// differ from Python's; what they inflate to is the same (decisions.yaml,
// `update-gzip-bytes-differ`).

import { createHash } from 'node:crypto'
import {
  closeSync,
  createReadStream,
  createWriteStream,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { Data, Duration, Effect, Fiber } from 'effect'
import { ZipError } from '../imports/zip.ts'
import { isInside, REPOSITORY } from '../rebuild/rebuild.ts'
import { Environment } from '../runtime/Environment.ts'
import { engineError, type EngineError } from '../runtime/EngineError.ts'
import { Run } from '../runtime/Run.ts'
import { GROUPLENS_SOURCES, validateZip } from './review.ts'
import { gzipBytes } from './text-source.ts'
import {
  GENOME,
  IMDB_BASICS,
  IMDB_PRINCIPALS,
  IMDB_RATINGS,
  LABELS,
  MOVIELENS,
  wikidataName,
} from './versions.ts'
import {
  GROUPS,
  groupQuery,
  labelsQuery,
  QLEVER,
  qid,
  sparqlBindings,
  sparqlRows,
  WDQS,
  type Binding,
} from './wikidata.ts'

const IMDB_URL = 'https://datasets.imdbws.com/'
const AGENT = 'filmes/0.1 (https://github.com/YgorPerez/filmes)'
/** Items per labels query to QLever, and to the WDQS when QLever fails. */
const LABELS_BATCH = 20_000
const WDQS_BATCH = 500
/** How long a connection may stay silent (Python's socket `timeout`). */
const TIMEOUT_MS = 180_000
const TRIES = 3
/** The HTTP answers tried again: the WDQS limit and gateway errors. */
const RETRIED = new Set([429, 502, 503])

/** One pinned dump, as the manifest and the output give it. */
export interface PinnedDump {
  readonly date: string
  readonly sha256: string
  readonly bytes: number
  readonly source: string
  readonly url: string
  /** The labels' WDQS, when some batch fell back to it. */
  readonly fallback?: string
}

/** `atualizar`'s result: the manifest's path and what it now pins. */
export interface Updated {
  readonly versions: string
  readonly dumps: Readonly<Record<string, PinnedDump>>
}

/** A progress event, as `atualizar` wrote it on stderr (EN keys of
 * key-migration's `progress` table). `progress` counts steps and may be a
 * fraction inside one. */
export interface UpdateProgress {
  readonly progress: number
  readonly total: number
  readonly message: string
}

export interface UpdateRequest {
  readonly onProgress?: (event: UpdateProgress) => Effect.Effect<void>
  /** The network. Default: the global `fetch`; tests pass a fake. */
  readonly fetch?: typeof globalThis.fetch
}

/** A failure Python's `atualizar` catches (`FALHAS`): it ends the update
 * with `update_failed`, or, for a SPARQL group, falls back to the WDQS.
 * `message` is Python's `str(erro)`. An HTTP answer carries its status, a
 * failed connection `network`, so `open` knows what to try again. */
class Failure extends Data.TaggedError('UpdateFailure')<{
  readonly message: string
  readonly status?: number
  readonly retryAfter?: string
  readonly network?: boolean
}> {}

/** Something Python would have crashed on: a defect. */
class Crash extends Data.TaggedError('UpdateCrash')<{
  readonly error: unknown
}> {}

const failure = (message: string) => new Failure({ message })

/** Python's `OSError` text, from Node's: `[Errno 2] No such file or
 * directory: '<path>'`. */
const osErrorText = (error: NodeJS.ErrnoException): string => {
  const strerror = /^[A-Z]+: ([^,]*)/.exec(error.message)?.[1]
  if (strerror === undefined || error.errno === undefined) return error.message
  const text = strerror.charAt(0).toUpperCase() + strerror.slice(1)
  return `[Errno ${-error.errno}] ${text}: '${String(error.path)}'`
}

const PYTHON_PREFIX = /^(ValueError|KeyError): /

/** The failure an error stands for, or a crash where Python would not have
 * caught it. A `KeyError` counts only where Python caught it (a ZIP without
 * a member). */
const classify = (error: unknown, keyError: boolean): Failure | Crash => {
  if (error instanceof Failure) return error
  if (error instanceof ZipError && error.kind === 'bad_zip')
    return failure(error.message)
  if (!(error instanceof Error)) return new Crash({ error })
  const prefix = PYTHON_PREFIX.exec(error.message)?.[1]
  if (prefix === 'ValueError' || (prefix === 'KeyError' && keyError))
    return failure(error.message.slice(prefix.length + 2))
  // A SPARQL row that is not JSON (ijson's JSONError).
  if (error instanceof SyntaxError) return failure(error.message)
  const code = (error as NodeJS.ErrnoException).code
  if (code === 'ERR_ENCODING_INVALID_ENCODED_DATA')
    return failure(`'utf-8' codec can't decode: ${error.message}`)
  if (code === 'Z_BUF_ERROR')
    return failure(
      'Compressed file ended before the end-of-stream marker was reached',
    )
  if (code?.startsWith('Z_') === true) return failure(error.message)
  if (code?.startsWith('E') === true)
    return failure(osErrorText(error as NodeJS.ErrnoException))
  return new Crash({ error })
}

/** Runs a promise: a failure fails, anything else is a defect. */
const attempt = <A>(
  run: () => Promise<A>,
  keyError = false,
): Effect.Effect<A, Failure> =>
  Effect.tryPromise({
    try: run,
    catch: (error) => classify(error, keyError),
  }).pipe(Effect.catchTag('UpdateCrash', (crash) => Effect.die(crash.error)))

/** A response body as bytes, failing when the connection stays silent for
 * `TIMEOUT_MS` (a timer per chunk, as Python's socket timeout). */
async function* responseBytes(
  stream: ReadableStream<Uint8Array>,
  controller: AbortController,
): AsyncGenerator<Buffer> {
  const silent = () => setTimeout(() => controller.abort(), TIMEOUT_MS)
  let timer = silent()
  try {
    for await (const chunk of stream) {
      clearTimeout(timer)
      yield Buffer.from(chunk)
      timer = silent()
    }
  } catch (error) {
    throw controller.signal.aborted
      ? failure('The read operation timed out')
      : // undici fails a body read with an Error (`terminated`...).
        failure((error as Error).message)
  } finally {
    clearTimeout(timer)
  }
}

interface Opened {
  readonly headers: Headers
  readonly bytes: AsyncIterable<Buffer>
}

const requestOnce = async (
  fetch: typeof globalThis.fetch,
  url: string,
  init: RequestInit,
): Promise<Opened> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause
    const reason = controller.signal.aborted
      ? 'timed out'
      : cause instanceof Error
        ? cause.message
        : String(error)
    throw new Failure({ message: `<urlopen error ${reason}>`, network: true })
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) {
    await response.body?.cancel()
    throw new Failure({
      message: `HTTP Error ${response.status}: ${response.statusText}`,
      status: response.status,
      retryAfter: response.headers.get('Retry-After') ?? '',
    })
  }
  return {
    headers: response.headers,
    bytes: responseBytes(response.body ?? new Blob().stream(), controller),
  }
}

/** `_abrir`: a GET (with the query in the URL) or a form POST, tried again
 * on 429, 502 and 503 (waiting `Retry-After` up to 60 s, or 1 s then 2 s)
 * and on a failed connection. */
const open = (
  fetch: typeof globalThis.fetch,
  url: string,
  query?: string,
  post = false,
): Effect.Effect<Opened, Failure> => {
  const headers: Record<string, string> = { 'User-Agent': AGENT }
  let target = url
  let body: string | undefined
  if (query) {
    const parameters = new URLSearchParams({ query }).toString()
    headers['Accept'] = 'application/sparql-results+json'
    if (post) {
      body = parameters
      headers['Content-Type'] = 'application/x-www-form-urlencoded'
    } else target += `?${parameters}`
  }
  const init: RequestInit = {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    body,
  }
  const from = (tried: number): Effect.Effect<Opened, Failure> =>
    attempt(() => requestOnce(fetch, target, init)).pipe(
      Effect.catchTag('UpdateFailure', (error) => {
        const last = tried === TRIES - 1
        const retried =
          error.status === undefined
            ? error.network === true
            : RETRIED.has(error.status)
        if (last || !retried) return Effect.fail(error)
        const seconds =
          error.retryAfter !== undefined && /^[0-9]+$/.test(error.retryAfter)
            ? Math.min(60, Number(error.retryAfter))
            : 2 ** tried
        return Effect.sleep(Duration.seconds(seconds)).pipe(
          Effect.andThen(from(tried + 1)),
        )
      }),
    )
  return from(0)
}

async function* fileBytes(path: string): AsyncGenerator<Buffer> {
  for await (const chunk of createReadStream(path, { highWaterMark: 1 << 20 }))
    yield chunk as Buffer
}

/** Bytes into a file, as they come. */
const save = (bytes: AsyncIterable<Buffer>, file: string) =>
  pipeline(Readable.from(bytes), createWriteStream(file))

/** Bytes into a gzip file (`_comprimir`, level 3). */
const compress = (bytes: AsyncIterable<Buffer>, file: string) =>
  pipeline(
    Readable.from(bytes),
    createGzip({ level: 3 }),
    createWriteStream(file),
  )

const sha256 = (path: string): string => {
  const hash = createHash('sha256')
  const fd = openSync(path, 'r')
  try {
    const buffer = Buffer.allocUnsafe(1 << 22)
    for (;;) {
      const read = readSync(fd, buffer, 0, buffer.length, null)
      if (read === 0) break
      hash.update(buffer.subarray(0, read))
    }
  } finally {
    closeSync(fd)
  }
  return hash.digest('hex')
}

const IMDB_HEADER = Buffer.from('tconst\t')

/** The IMDb dump's first line starts with its header (its first bytes
 * are the header's), checked before the rest inflates, as Python's
 * `readline` then `read`. */
const checkImdb = async (file: string, name: string) => {
  let head = Buffer.alloc(0)
  const check = () => {
    if (!head.subarray(0, IMDB_HEADER.length).equals(IMDB_HEADER))
      throw failure(`cabeçalho inesperado em ${name}`)
  }
  for await (const chunk of gzipBytes(file))
    if (head.length < IMDB_HEADER.length) {
      head = Buffer.concat([head, chunk])
      if (head.length >= IMDB_HEADER.length) check()
    }
  if (head.length < IMDB_HEADER.length) check()
}

/** Each key's keys sorted, as `json.dump(..., sort_keys=True)`. */
const sortedKeys = (value: unknown): unknown =>
  typeof value === 'object' && value !== null
    ? Object.fromEntries(
        Object.entries(value)
          // Code-unit order, as Python sorts str keys.
          .sort(([a], [b]) => Number(a > b) - Number(a < b))
          .map(([key, inner]) => [key, sortedKeys(inner)]),
      )
    : value

/** `versoes.gravar`: the manifest, replaced at once. */
const writeManifest = (path: string, dumps: Record<string, PinnedDump>) => {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}`)
  try {
    writeFileSync(
      temporary,
      `${JSON.stringify(sortedKeys({ dumps }), null, 2)}\n`,
    )
    renameSync(temporary, path)
  } finally {
    rmSync(temporary, { force: true })
  }
}

const hasValue = (row: Binding, field: string): boolean => {
  const term = row[field] as unknown
  return typeof term === 'object' && term !== null && 'value' in term
}

interface LabelBatch {
  readonly rows: Binding[]
  readonly fallback: boolean
}

/** `_buscar_rotulos`: one batch from QLever, or from the WDQS in smaller
 * batches when QLever fails. */
const fetchLabels = (
  fetch: typeof globalThis.fetch,
  items: readonly string[],
): Effect.Effect<LabelBatch, Failure> => {
  const ask = (url: string, batch: readonly string[]) =>
    Effect.gen(function* () {
      const opened = yield* open(fetch, url, labelsQuery(batch), true)
      return yield* attempt(async () => {
        const rows: Binding[] = []
        for await (const chunk of sparqlBindings(opened.bytes))
          rows.push(...chunk)
        const got = new Set(rows.map((row) => qid(row['valor'])))
        if (got.size !== batch.length || batch.some((item) => !got.has(item)))
          throw failure('lote de rótulos do Wikidata incompleto')
        return rows
      })
    })
  return ask(QLEVER, items).pipe(
    Effect.map((rows): LabelBatch => ({ rows, fallback: false })),
    Effect.catchTag('UpdateFailure', () =>
      Effect.gen(function* () {
        const rows: Binding[] = []
        for (let at = 0; at < items.length; at += WDQS_BATCH)
          rows.push(...(yield* ask(WDQS, items.slice(at, at + WDQS_BATCH))))
        return { rows, fallback: true }
      }),
    ),
  )
}

type Fraction = (fraction: number, message: string) => Effect.Effect<void>

/** One run of `atualizar` (`_Atualizacao`): the downloads into `folder`,
 * what each pins, and every Wikidata item seen (for the labels). */
const makeUpdate = (options: {
  readonly catalog: string
  readonly folder: string
  readonly recordings: string | undefined
  readonly today: string
  readonly fetch: typeof globalThis.fetch
}) => {
  const { catalog, folder, recordings, today, fetch } = options
  const dumps: Record<string, PinnedDump> = {}
  const items = new Set<string>()
  const recording = (name: string) =>
    join(recordings!, name.replace(/\.gz$/, ''))

  /** `_guardar`: pins the file under its SHA-256. */
  const keep = (name: string, source: string, url: string, date: string) =>
    attempt(async () => {
      const file = join(folder, name)
      const hash = sha256(file)
      const destination = join(catalog, hash, name)
      mkdirSync(dirname(destination), { recursive: true })
      dumps[name] = {
        date,
        sha256: hash,
        bytes: statSync(file).size,
        source,
        url,
      }
      renameSync(file, destination)
    })

  const grouplens = (name: string) => {
    const { source, date, url } = GROUPLENS_SOURCES.get(name)!
    const file = join(folder, name)
    return Effect.gen(function* () {
      const bytes =
        recordings === undefined
          ? (yield* open(fetch, url)).bytes
          : fileBytes(join(recordings, name))
      yield* attempt(async () => {
        await save(bytes, file)
        await validateZip(file, name)
      }, true)
    }).pipe(
      Effect.mapError((error) => failure(`${name}: ${error.message}`)),
      Effect.andThen(keep(name, source, url, date)),
    )
  }

  const imdb = (name: string) =>
    Effect.gen(function* () {
      const url = IMDB_URL + name
      const file = join(folder, name)
      let date = today
      if (recordings === undefined) {
        const opened = yield* open(fetch, url)
        date = opened.headers.get('x-amz-meta-run-date') ?? today
        yield* attempt(() => save(opened.bytes, file))
      } else yield* attempt(() => compress(fileBytes(recording(name)), file))
      yield* attempt(() => checkImdb(file, name))
      yield* keep(name, 'IMDb', url, date)
    })

  const sparql = (name: string, source: string, url: string, query: string) =>
    Effect.gen(function* () {
      const file = join(folder, name)
      const bytes =
        recordings === undefined
          ? (yield* open(fetch, url, query)).bytes
          : fileBytes(recording(name))
      yield* attempt(() => compress(bytes, file))
      const fields = name === LABELS ? ['valor'] : ['item', 'p', 'valor']
      const seen = yield* attempt(async () => {
        const found = new Set<string>()
        for await (const rows of sparqlRows(file))
          for (const row of rows) {
            if (fields.some((field) => !hasValue(row, field)))
              throw failure(`linha SPARQL sem os campos esperados em ${name}`)
            for (const field of ['item', 'valor']) {
              const item = qid(row[field])
              if (item !== undefined) found.add(item)
            }
          }
        return found
      })
      for (const item of seen) items.add(item)
      yield* keep(name, source, url, today)
    })

  const wikidata = (
    group: string,
    properties: readonly string[],
    progress: Fraction,
  ) =>
    Effect.gen(function* () {
      yield* progress(0, `Consultando o QLever (${group})`)
      yield* sparql(
        wikidataName(group),
        'QLever',
        QLEVER,
        groupQuery(group, properties),
      ).pipe(
        Effect.catchTag('UpdateFailure', (error) =>
          Effect.gen(function* () {
            yield* progress(
              0.1,
              `QLever falhou (${group}): ${error.message}. Consultando o WDQS por predicado.`,
            )
            for (const [index, property] of properties.entries()) {
              yield* progress(
                0.1 + (0.9 * (index + 1)) / (properties.length + 1),
                `Consultando o WDQS (${group}, ${property})`,
              )
              yield* sparql(
                wikidataName(group, property),
                'WDQS',
                WDQS,
                groupQuery(group, [property]),
              )
            }
          }),
        ),
      )
    })

  const labels = (progress: Fraction) =>
    Effect.gen(function* () {
      yield* progress(0, 'Consultando o QLever (rótulos)')
      if (recordings !== undefined)
        return yield* sparql(LABELS, 'QLever', QLEVER, '')
      const sorted = [...items].sort()
      const batches: string[][] = []
      for (let at = 0; at < sorted.length; at += LABELS_BATCH)
        batches.push(sorted.slice(at, at + LABELS_BATCH))
      const gzip = createGzip({ level: 3 })
      const written = pipeline(gzip, createWriteStream(join(folder, LABELS)))
      // Two batches in flight, consumed in order (Python's `pool.map` with
      // two workers).
      const started: Array<Fiber.Fiber<LabelBatch, Failure>> = []
      const start = (index: number) =>
        index < batches.length && started[index] === undefined
          ? Effect.forkChild(fetchLabels(fetch, batches[index]!)).pipe(
              Effect.map((fiber) => {
                started[index] = fiber
              }),
            )
          : Effect.void
      let usedWdqs = false
      let separator = ''
      gzip.write(
        '{"head":{"vars":["valor","pt","en","mul","codigo"]},"results":{"bindings":[',
      )
      for (const index of batches.keys()) {
        yield* start(index)
        yield* start(index + 1)
        const batch = yield* Fiber.join(started[index]!)
        usedWdqs ||= batch.fallback
        for (const row of batch.rows) {
          gzip.write(separator + JSON.stringify(row))
          separator = ','
        }
        yield* progress(
          (index + 1) / (batches.length + 1),
          `Rótulos do Wikidata: lote ${index + 1}/${batches.length}`,
        )
      }
      gzip.end(']}}')
      yield* attempt(() => written)
      yield* keep(LABELS, usedWdqs ? 'QLever e WDQS' : 'QLever', QLEVER, today)
      if (usedWdqs) dumps[LABELS] = { ...dumps[LABELS]!, fallback: WDQS }
    })

  return { dumps, grouplens, imdb, wikidata, labels }
}

/** The dumps downloaded first, in Python's order. */
const DOWNLOADS = [
  MOVIELENS,
  GENOME,
  IMDB_BASICS,
  IMDB_RATINGS,
  IMDB_PRINCIPALS,
]

/** `atualizar`: downloads every dump and pins the new versions. */
export const update = (
  request: UpdateRequest = {},
): Effect.Effect<Updated, EngineError, Environment | Run> =>
  Effect.gen(function* () {
    const environment = yield* Environment
    const { today } = yield* Run
    const catalog = yield* environment.path('catalog')
    const versions = yield* environment.path('versions')
    if (isInside(resolve(catalog), REPOSITORY))
      return yield* engineError(
        'invalid_config',
        'ponha FILMES_CATALOGO fora do repositório de código',
      )
    const recordings = environment.paths.recordings
    const progress = request.onProgress ?? (() => Effect.void)
    mkdirSync(catalog, { recursive: true })
    const steps = DOWNLOADS.length + GROUPS.length + 1
    const dumps = yield* Effect.acquireUseRelease(
      Effect.sync(() => mkdtempSync(join(catalog, 'tmp'))),
      (folder) =>
        Effect.gen(function* () {
          const run = makeUpdate({
            catalog,
            folder,
            recordings:
              recordings === undefined
                ? undefined
                : join(recordings, 'catalogo'),
            today,
            fetch: request.fetch ?? globalThis.fetch,
          })
          for (const [position, name] of DOWNLOADS.entries()) {
            yield* progress({
              progress: position,
              total: steps,
              message: `Baixando ${name}`,
            })
            yield* GROUPLENS_SOURCES.has(name)
              ? run.grouplens(name)
              : run.imdb(name)
          }
          for (const [index, [group, properties]] of GROUPS.entries()) {
            const position = DOWNLOADS.length + index
            yield* run.wikidata(group, properties, (fraction, message) =>
              progress({
                progress: position + fraction,
                total: steps,
                message,
              }),
            )
          }
          yield* run.labels((fraction, message) =>
            progress({ progress: steps - 1 + fraction, total: steps, message }),
          )
          yield* attempt(async () => writeManifest(versions, run.dumps))
          return run.dumps
        }),
      (folder) =>
        Effect.sync(() => rmSync(folder, { recursive: true, force: true })),
    ).pipe(
      Effect.mapError((error) => engineError('update_failed', error.message)),
    )
    yield* progress({
      progress: steps,
      total: steps,
      message: 'Versões do Catálogo gravadas',
    })
    return { versions, dumps }
  })
