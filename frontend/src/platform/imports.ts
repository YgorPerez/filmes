// Imports (map #72, W5): a Pessoa's Letterboxd and Trakt exports, her
// IMDb ratings CSV (#285), her Letterboxd RSS, and the resolution queue the Letterboxd imports share.
// The pages read through `Imports`; a Pessoa's forms post to
// `/importar/<slug>/acao` and the queue's to `/fila/acao`, which run as the
// logged-in Dono (the commit's author) and go back with what happened.
// Server only.

import {
  confirmQueueItem,
  discardQueueItem,
  exportSource,
  importImdb,
  importLetterboxd,
  importLetterboxdRss,
  importTrakt,
  readPeople,
  personImports,
  removeImport,
  reprocessLetterboxd,
  viewQueue,
  type Author,
  type Engine,
  type ErrorOutput,
  type Outcome,
  type PersonImports,
  type QueueItem,
} from '@filmes/engine'
import {
  MAX_UPLOAD_BYTES,
  parseImport,
  parseQueue,
  type ImportAction,
  type ImportNotice,
  type ImportRefusal,
  type ImportRun,
  type QueueAction,
  type QueueNotice,
  type QueueRefusal,
} from '#/content/import-action'
import { importsPath, QUEUE_PATH } from '#/content/paths'
import { currentOwner } from './auth'
import { appEngine } from './engine'
import { failureOf, formPoster, seeOther } from './form-post'
import { ownerAuthor } from './people'
import { rateAction, ratingQueuePage, ratingsFromEngine } from './ratings'
import { serverEnv } from './server-env'

/** Whoever is logged in, as the login reads her (`currentOwner`). */
type LoggedIn = ReturnType<typeof currentOwner>

/** A TMDB suggestion for a queued film, as the page shows it. */
export type QueueSuggestion = {
  tmdb: string
  title: string
  originalTitle: string | null
  year: number | null
  /** The TMDB film's page: confirming with it records the film. */
  link: string
}

export type QueueEntry = Omit<QueueItem, 'candidates' | 'people'> & {
  people: string[]
  candidates: QueueSuggestion[]
}

/** The queue, with the names of the Pessoas who have each film. */
export type QueuePage = {
  items: QueueEntry[]
  names: Record<string, string>
  /** TMDB's notice, when a suggestion came from it. */
  attributions: { source: string; text: string }[]
}

const textOr = (value: unknown, fallback: string | null) =>
  typeof value === 'string' && value !== '' ? value : fallback

const entryOf = (item: QueueItem): QueueEntry => ({
  ...item,
  people: [...item.people],
  candidates: item.candidates.map((c) => {
    const title = textOr(c.title, null) ?? textOr(c.originalTitle, '') ?? ''
    const original = textOr(c.originalTitle, null)
    return {
      tmdb: String(c.tmdb),
      title,
      originalTitle: original === title ? null : original,
      year: c.year,
      link: c.link,
    }
  }),
})

/** What an import or a removal did, for the page's notice. */
export type ImportDone = {
  notice: ImportNotice
  /** Fatos that came in (or went, for a removal). */
  facts: number
  /** Trakt or IMDb films the Catalog could not resolve. */
  outside?: number
}

export type QueueDone = {
  notice: QueueNotice
  /** Reprocessing: films that left the queue, films still there. */
  resolved?: number
  left?: number
}

/** What the screens and the actions need from the engine. */
export interface Imports {
  page(person: string): Promise<Outcome<PersonImports>>
  queue(): Promise<Outcome<QueuePage>>
  run(
    person: string,
    action: ImportRun,
    author: Author,
  ): Promise<Outcome<ImportDone>>
  decide(action: QueueAction, author: Author): Promise<Outcome<QueueDone>>
}

const map = async <A, B>(
  outcome: Promise<Outcome<A>>,
  f: (a: A) => B,
): Promise<Outcome<B>> => {
  const done = await outcome
  return done.exitCode === 0 ? { exitCode: 0, output: f(done.output) } : done
}

const sum = (counts: Readonly<Record<string, number>>) =>
  Object.values(counts).reduce((a, b) => a + b, 0)

type Run = Engine['run']

/** The queue with the Pessoas' names, from the engine's queue and list. */
async function queueOf(run: Run): Promise<Outcome<QueuePage>> {
  const people = await run(readPeople)
  if (people.exitCode !== 0) return people
  return map(run(viewQueue), (queue) => ({
    items: queue.items.map(entryOf),
    attributions: queue.attributions.map(({ source, text }) => ({
      source,
      text,
    })),
    names: Object.fromEntries(
      people.output.map(({ slug, name }) => [slug, name]),
    ),
  }))
}

/** An import or a removal on the Pessoa's files, as `author`. */
function runImport(
  run: Run,
  person: string,
  action: ImportRun,
  author: Author,
): Promise<Outcome<ImportDone>> {
  switch (action.kind) {
    case 'letterboxd':
      return map(
        run(importLetterboxd({ person, ...upload(action), author })),
        (r): ImportDone => ({
          notice: r.newFile ? 'letterboxd' : 'repetido',
          facts: sum(r.newFacts),
        }),
      )
    case 'rss':
      return map(
        run(importLetterboxdRss({ person, user: action.user, author })),
        (r): ImportDone => ({
          notice: r.newFile ? 'rss' : 'repetido',
          facts: sum(r.newFacts),
        }),
      )
    case 'trakt':
      return map(
        run(importTrakt({ person, ...upload(action), author })),
        (r): ImportDone => ({
          notice: r.newFile ? 'trakt' : 'repetido',
          facts: sum(r.newFacts),
          outside: r.unresolved.length,
        }),
      )
    case 'imdb':
      return map(
        run(importImdb({ person, ...upload(action), author })),
        (r): ImportDone => ({
          notice: r.newFile ? 'imdb' : 'repetido',
          facts: r.newFacts.ratings,
          outside: r.outsideCatalog.length,
        }),
      )
    case 'remove':
      return map(
        run(removeImport({ file: action.file, person, author })),
        (r): ImportDone => ({
          notice: 'removido',
          facts: sum(r.removedFacts),
        }),
      )
  }
}

const upload = ({
  original,
  content,
}: {
  original: string
  content: Uint8Array
}) => ({
  original,
  content,
})

/** The Dono's decision on the queue, as `author`. */
function runDecision(
  run: Run,
  action: QueueAction,
  author: Author,
): Promise<Outcome<QueueDone>> {
  switch (action.kind) {
    case 'confirm':
      return map(
        run(confirmQueueItem({ id: action.id, film: action.film, author })),
        (r): QueueDone => ({ notice: r.new ? 'confirmado' : 'igual' }),
      )
    case 'discard':
      return map(
        run(discardQueueItem({ id: action.id, reason: action.reason, author })),
        (r): QueueDone => ({ notice: r.new ? 'descartado' : 'igual' }),
      )
    case 'reprocess':
      return map(run(reprocessLetterboxd({ author })), (r): QueueDone => ({
        notice: 'reprocessado',
        resolved: r.resolved.length + r.discarded.length,
        left: r.queue.length,
      }))
  }
}

export function importsFromEngine(engine: Engine): Imports {
  const run = engine.run
  return {
    page: (person) => run(personImports(person)),
    queue: () => queueOf(run),
    run: (person, action, author) => runImport(run, person, action, author),
    decide: (action, author) => runDecision(run, action, author),
  }
}

/** An engine error the Dono cannot fix from the page goes to the server log
 * (`docker logs`), so whoever runs the server sees why. */
function logEngineError(outcome: { output: ErrorOutput }): void {
  const { code, message } = outcome.output.error
  console.error(`engine: ${code}: ${message}`)
}

/** What a page shows, or null (logged) when the engine cannot run here. */
async function shown<A>(outcome: Promise<Outcome<A>>): Promise<A | null> {
  const done = await outcome
  if (done.exitCode === 0) return done.output
  logEngineError(done)
  return null
}

/** What a Pessoa's import page shows to `viewer` (the logged-in Dono's slug),
 * with whether it is her own page (no consent box there: she answers for
 * herself); `'unknown'` when no Pessoa has that slug. */
export async function importsPage(
  person: string,
  viewer: string,
  imports: Imports,
): Promise<(PersonImports & { own: boolean }) | 'unknown' | null> {
  const page = await imports.page(person)
  if (page.exitCode !== 0 && page.output.error.code === 'unknown_person')
    return 'unknown'
  const shownPage = await shown(Promise.resolve(page))
  return shownPage && { ...shownPage, own: shownPage.person === viewer }
}

/** The upload once its service is known by what the file holds; null when
 * it is neither Letterboxd's, Trakt's nor IMDb's. */
function runOf(action: ImportAction): ImportRun | null {
  if (action.kind !== 'upload') return action
  const source = exportSource(action.content)
  return source && { ...action, kind: source }
}

/** What the resolution queue (`QUEUE_PATH`) shows. */
export const queuePage = (imports: Imports) => shown(imports.queue())

function importRefusal(outcome: { output: ErrorOutput }): ImportRefusal {
  switch (outcome.output.error.code) {
    case 'invalid_file':
    case 'missing_file':
      return 'arquivo'
    case 'invalid_usage':
      return 'pedido'
    case 'missing_rss':
      return 'rss'
    case 'source_unavailable':
      return 'fonte'
    case 'unknown_import':
    case 'ambiguous_import':
      return 'item'
    default:
      logEngineError(outcome)
      return failureOf(outcome)
  }
}

function queueRefusal(outcome: { output: ErrorOutput }): QueueRefusal {
  switch (outcome.output.error.code) {
    case 'invalid_usage':
      return 'filme'
    case 'film_without_imdb':
      return 'sem-imdb'
    case 'item_not_queued':
      return 'item'
    default:
      logEngineError(outcome)
      return failureOf(outcome)
  }
}

const query = (fields: Record<string, string | number | undefined>) => {
  const params = new URLSearchParams()
  for (const [name, value] of Object.entries(fields))
    if (value !== undefined) params.set(name, String(value))
  return `?${params.toString()}`
}

/** `POST /importar/<slug>/acao`: a Letterboxd or Trakt ZIP or the IMDb
 * CSV (multipart, told apart by what it holds), the RSS (only with the Pessoa's consent,
 * which the engine does not ask; on her own page the Dono answers for
 * herself), or removing an import; as the logged-in Dono, who signs the
 * commit. */
export async function importAction(
  request: Request,
  person: string,
  owner: LoggedIn,
  imports: Imports,
  origin: string | undefined,
): Promise<Response> {
  const signer = formPoster(request, owner, origin)
  if (signer instanceof Response) return signer
  const page = importsPath(person, person === signer.person)
  if (Number(request.headers.get('content-length')) > MAX_UPLOAD_BYTES)
    return seeOther(`${page}${query({ erro: 'grande' })}`)
  const action = await parseImport(
    await request.formData(),
    person === signer.person,
  )
  if (typeof action === 'string')
    return seeOther(`${page}${query({ erro: action })}`)
  const run = runOf(action)
  if (run === null) return seeOther(`${page}${query({ erro: 'origem' })}`)
  const outcome = await imports.run(person, run, ownerAuthor(signer))
  if (outcome.exitCode !== 0) {
    if (outcome.output.error.code === 'unknown_person')
      return seeOther('/pessoas?erro=pessoa')
    return seeOther(`${page}${query({ erro: importRefusal(outcome) })}`)
  }
  const { notice, facts, outside } = outcome.output
  return seeOther(
    `${page}${query({ feito: notice, novos: facts, fora: outside })}`,
  )
}

/** `POST /fila/acao`: confirm or discard a queued film, or ask TMDB again;
 * as the logged-in Dono. */
export async function queueAction(
  request: Request,
  owner: LoggedIn,
  imports: Imports,
  origin: string | undefined,
): Promise<Response> {
  const signer = formPoster(request, owner, origin)
  if (signer instanceof Response) return signer
  const action = parseQueue(await request.formData())
  if (!action) return seeOther(`${QUEUE_PATH}${query({ erro: 'pedido' })}`)
  const outcome = await imports.decide(action, ownerAuthor(signer))
  if (outcome.exitCode !== 0)
    return seeOther(`${QUEUE_PATH}${query({ erro: queueRefusal(outcome) })}`)
  const { notice, resolved, left } = outcome.output
  return seeOther(
    `${QUEUE_PATH}${query({ feito: notice, resolvidos: resolved, restam: left })}`,
  )
}

// --- the app's -----------------------------------------------------------------

const appImports = () => importsFromEngine(appEngine())

export const appImportsPage = (person: string, viewer: string) =>
  importsPage(person, viewer, appImports())

export const appQueuePage = () => queuePage(appImports())

export const serveImportAction = (request: Request, person: string) =>
  importAction(
    request,
    person,
    currentOwner(request),
    appImports(),
    serverEnv().APP_ORIGIN,
  )

export const serveQueueAction = (request: Request) =>
  queueAction(
    request,
    currentOwner(request),
    appImports(),
    serverEnv().APP_ORIGIN,
  )

// The rating screen (#144), the Import's twin for a Dono with no Letterboxd
// nor Trakt: here, since `engine.ts` is at fallow's coupling limit.

const appRatings = () => ratingsFromEngine(appEngine())

/** The Fila de Notas for the app, of the logged-in Dono. */
export const appRatingQueue = (owner: { person: string }) =>
  ratingQueuePage(owner, appRatings())

/** Pronto's route for the app: the logged-in Dono, the process's engine. */
export const serveRate = (request: Request) =>
  rateAction(
    request,
    currentOwner(request),
    appRatings(),
    serverEnv().APP_ORIGIN,
  )
