// Imports (map #72, W5): a Pessoa's Letterboxd and Trakt exports, her
// IMDb ratings CSV (#285), her Simkl backup (#299), her TV Time backup
// (#300), her Letterboxd RSS, and the resolution queue the Letterboxd and
// TV Time imports share.
// The pages read through `Imports`; a Pessoa's forms post to
// `/importar/<slug>/acao` and the queue's to `/fila/acao`, which run as the
// logged-in Dono (the commit's author) and go back with what happened.
// Server only.

import {
  confirmQueueItem,
  discardQueueItem,
  reopenQueueItem,
  exportSource,
  importImdb,
  importLetterboxd,
  importLetterboxdRss,
  importSimkl,
  importTrakt,
  importTvTime,
  readPeople,
  personImports,
  removeImport,
  reprocessLetterboxd,
  syncTrakt,
  viewQueueDetailed,
  type Author,
  type Engine,
  type ErrorOutput,
  type Outcome,
  type PersonImports,
  type DetailedQueueItem,
  type QueueItem,
  type RatingChange,
  type TasteChange,
} from '@filmes/engine'
import {
  changesParam,
  isImportForm,
  MAX_UPLOAD_BYTES,
  parseImport,
  parseQueue,
  type ChangedRating,
  type ImportAction,
  type ImportNotice,
  type ImportRefusal,
  type ImportRun,
  type QueueAction,
  type QueueNotice,
  type QueueRefusal,
} from '#/content/import-action'
import { importsPath, QUEUE_PATH } from '#/content/paths'
import { appEngine } from './engine'
import { appPoster, failureOf, formPoster, seeOther } from './form-post'
import { ownerAuthor } from './people'
import {
  filmCardOf,
  myRatingsOf,
  rateAction,
  ratingQueuePage,
  ratingsFromEngine,
  tasteSummaryOf,
} from './ratings'
import { traktLink } from './trakt'

/** Whoever is logged in, as the login reads her (`appPoster`). */
type LoggedIn = ReturnType<typeof appPoster>['owner']

/** A TMDB suggestion for a queued film, as the page shows it. */
export type QueueSuggestion = {
  tmdb: string
  title: string
  originalTitle: string | null
  year: number | null
  /** The TMDB film's page: confirming with it records the film. */
  link: string
  poster: string | null
  /** TMDB's synopsis in Portuguese or English, for telling twins apart;
   * null when it is only in another language (#274). */
  overview: string | null
  /** What else tells twins apart (#274): the directors, the runtime, the
   * production countries (ISO 3166-1) and, when it is not Portuguese,
   * the original language (ISO 639-1). */
  directors: string[]
  runtime: number | null
  countries: string[]
  language: string | null
}

/** The languages a synopsis may show in: the page's, and English. */
const READABLE = new Set(['pt', 'en'])

/** The synopsis the page can show: TMDB's pt-BR one, else the search's
 * when the film's language is one she reads (the search falls back to the
 * original's, "Ein Segler verliert…"). */
const overviewOf = (
  search: string | null,
  details: DetailedQueueItem['candidates'][number]['details'],
) => {
  if (details?.overviewPt) return details.overviewPt
  if (details?.language && !READABLE.has(details.language)) return null
  return search
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

const entryOf = (item: DetailedQueueItem): QueueEntry => ({
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
      poster: c.poster,
      overview: overviewOf(c.overview, c.details),
      directors: [...(c.details?.directors ?? [])],
      runtime: c.details?.runtime ?? null,
      countries: [...(c.details?.countries ?? [])],
      language:
        c.details?.language && c.details.language !== 'pt'
          ? c.details.language
          : null,
    }
  }),
})

/** What an import or a removal did, for the page's notice. */
export type ImportDone = {
  notice: ImportNotice
  /** Fatos that came in (or went, for a removal). */
  facts: number
  /** What her Notas list sees (#274): films with a first Nota, films seen
   * for the first time (without a Nota), films whose Nota in force
   * changed, the first few of them by name, and films that kept theirs. */
  ratings?: number
  seen?: number
  changed?: number
  changes?: readonly ChangedRating[]
  repeated?: number
  /** Films that came into her watchlist. */
  watchlist?: number
  /** Trakt, IMDb, Simkl or TV Time films the Catalog could not resolve. */
  outside?: number
}

export type QueueDone = {
  notice: QueueNotice
  /** The film decided on: its queue id, to take it back, and its name. */
  item?: { id: string; title: string }
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

/** How many changed Notas the notice names; the rest it counts. */
export const NAMED_CHANGES = 3

/** "Maré Baixa (2015)": a film as the notices name it. */
const filmTitle = (change: RatingChange) => {
  const name = change.title ?? change.film
  return change.year === null ? name : `${name} (${change.year})`
}

/** What an import did: its new Fatos, and what her Notas list sees. */
const counted = (
  newFacts: Readonly<Record<string, number>>,
  changes: TasteChange,
) => ({
  facts: sum(newFacts),
  ratings: changes.newRatings,
  seen: changes.newSeen,
  changed: changes.changedRatings.length,
  changes: changes.changedRatings.slice(0, NAMED_CHANGES).map((change) => ({
    title: filmTitle(change),
    from: Math.round(change.from * 2),
    to: Math.round(change.to * 2),
  })),
  repeated: changes.repeatedRatings,
  watchlist: newFacts.watchlist ?? 0,
})

type Run = Engine['run']

/** The queue with the Pessoas' names, from the engine's queue and list. */
async function queueOf(run: Run): Promise<Outcome<QueuePage>> {
  const people = await run(readPeople)
  if (people.exitCode !== 0) return people
  return map(run(viewQueueDetailed), (queue) => ({
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

/** What a file import did: its notice, or `repetido` for a file she had
 * sent already, and its counts. */
const filed = (
  notice: ImportNotice,
  r: {
    newFile: boolean
    newFacts: Readonly<Record<string, number>>
    changes: TasteChange
  },
): ImportDone => ({
  notice: r.newFile ? notice : 'repetido',
  ...counted(r.newFacts, r.changes),
})

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
        (r) => filed('letterboxd', r),
      )
    case 'rss':
      return map(
        run(importLetterboxdRss({ person, user: action.user, author })),
        (r) => filed('rss', r),
      )
    case 'trakt':
      return map(
        run(importTrakt({ person, ...upload(action), author })),
        (r) => ({
          ...filed('trakt', r),
          outside: r.unresolved.length,
        }),
      )
    case 'imdb':
      return map(
        run(importImdb({ person, ...upload(action), author })),
        (r) => ({
          ...filed('imdb', r),
          outside: r.outsideCatalog.length,
        }),
      )
    case 'simkl':
      return map(
        run(importSimkl({ person, ...upload(action), author })),
        (r) => ({
          ...filed('simkl', r),
          outside: r.unresolved.length,
        }),
      )
    case 'trakt-sync':
      return map(
        run(syncTrakt({ person, user: action.user ?? undefined, author })),
        (r): ImportDone => ({
          notice: 'sincronizado',
          ...counted(r.newFacts, r.changes),
          outside: r.unresolved.length,
        }),
      )
    case 'tvtime':
      return map(
        run(importTvTime({ person, ...upload(action), author })),
        (r) => ({
          ...filed('tvtime', r),
          outside: r.outsideCatalog.length,
        }),
      )
    case 'remove':
      return map(
        run(removeImport({ file: action.file, person, author })),
        (r): ImportDone => ({ notice: 'removido', facts: sum(r.removedFacts) }),
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

/** "Vento Norte (2020)": a queued film as the notices name it. */
const itemTitle = (name: string, year: number | null) =>
  year === null ? name : `${name} (${year})`

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
        (r): QueueDone => ({
          notice: r.new ? 'confirmado' : 'igual',
          item: { id: action.id, title: itemTitle(r.name, r.year) },
        }),
      )
    case 'discard':
      return map(
        run(discardQueueItem({ id: action.id, reason: action.reason, author })),
        (r): QueueDone => ({
          notice: r.new ? 'descartado' : 'igual',
          item: { id: action.id, title: itemTitle(r.name, r.year) },
        }),
      )
    case 'reopen':
      return map(
        run(reopenQueueItem({ id: action.id, author })),
        (r): QueueDone => ({
          notice: 'reaberto',
          item: { id: action.id, title: itemTitle(r.name, r.year) },
        }),
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
 * it is none of Letterboxd's, Trakt's, IMDb's, Simkl's or TV Time's. */
function runOf(action: ImportAction): ImportRun | null {
  if (action.kind !== 'upload') return action
  const source = exportSource(action.content)
  return source && { ...action, kind: source }
}

/** What the resolution queue (`QUEUE_PATH`) shows. */
export const queuePage = (imports: Imports) => shown(imports.queue())

/** Why her Trakt could not be read (#269), by the engine's reason. */
const TRAKT_REFUSALS: Partial<Record<string, ImportRefusal>> = {
  trakt_user_missing: 'trakt-usuario',
  trakt_private: 'trakt-privado',
  trakt_not_linked: 'trakt-sem',
  trakt_off: 'trakt-off',
}

function importRefusal(
  outcome: { output: ErrorOutput },
  kind?: ImportRun['kind'],
): ImportRefusal {
  if (kind === 'trakt-sync') {
    const { code, reason } = outcome.output.error
    const refusal = reason === undefined ? undefined : TRAKT_REFUSALS[reason]
    if (refusal) return refusal
    if (code === 'source_unavailable') return 'trakt-fonte'
  }
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

/** `POST /importar/<slug>/acao`: a Letterboxd, Trakt, Simkl or TV Time ZIP,
 * the IMDb CSV or the Simkl JSON (multipart, told apart by what it holds), the RSS (only with the Pessoa's consent,
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
  // The form that was sent, so the page shows its refusal under it.
  const sent = new URL(request.url).searchParams.get('de')
  const from = isImportForm(sent) ? sent : undefined
  const refused = (erro: ImportRefusal) =>
    seeOther(`${page}${query({ erro, de: from })}`)
  if (Number(request.headers.get('content-length')) > MAX_UPLOAD_BYTES)
    return refused('grande')
  const action = await parseImport(
    await request.formData(),
    person === signer.person,
  )
  if (typeof action === 'string') return refused(action)
  const run = runOf(action)
  if (run === null) return refused('origem')
  const outcome = await imports.run(person, run, ownerAuthor(signer))
  if (outcome.exitCode !== 0) {
    if (outcome.output.error.code === 'unknown_person')
      return seeOther('/pessoas?erro=pessoa')
    return refused(importRefusal(outcome, run.kind))
  }
  const done = outcome.output
  return seeOther(
    `${page}${query({
      feito: done.notice,
      novos: done.facts,
      notas: done.ratings,
      vistos: done.seen,
      mudaram: done.changed || undefined,
      mudou: changesParam(done.changes),
      iguais: done.repeated || undefined,
      lista: done.watchlist || undefined,
      fora: done.outside,
    })}`,
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
  const { notice, resolved, left, item } = outcome.output
  return seeOther(
    `${QUEUE_PATH}${query({
      feito: notice,
      resolvidos: resolved,
      restam: left,
      item: item?.id,
      titulo: item?.title,
    })}`,
  )
}

// --- the app's -----------------------------------------------------------------

const appImports = () => importsFromEngine(appEngine())

/** The page with what it needs of Trakt (#269): whether the server reads
 * it, and whether she connected hers. */
export const appImportsPage = async (person: string, viewer: string) => {
  const page = await importsPage(person, viewer, appImports())
  return page && page !== 'unknown'
    ? { ...page, traktLink: traktLink(page.person) }
    : page
}

export const appQueuePage = () => queuePage(appImports())

export const serveImportAction = (request: Request, person: string) => {
  const { owner, origin } = appPoster(request)
  return importAction(request, person, owner, appImports(), origin)
}

export const serveQueueAction = (request: Request) => {
  const { owner, origin } = appPoster(request)
  return queueAction(request, owner, appImports(), origin)
}

// The rating screen (#144), the Import's twin for a Dono with no Letterboxd
// nor Trakt: here, since `engine.ts` is at fallow's coupling limit.

const appRatings = () => ratingsFromEngine(appEngine())

/** The Fila de Notas for the app, of the logged-in Dono. */
export const appRatingQueue = (owner: { person: string }) =>
  ratingQueuePage(owner, appRatings())

/** One film's card for the rating screen, for the logged-in Dono. */
export const appFilmCard = (film: string, owner: { person: string }) =>
  filmCardOf(film, owner, appRatings())

/** The logged-in Dono's Notas of some films, for the rating screen. */
export const appRatingsOf = (
  films: readonly string[],
  owner: { person: string },
) => myRatingsOf(films, owner, appRatings())

/** Meu gosto's look at the logged-in Dono's taste. */
export const appTasteSummary = (owner: { person: string }) =>
  tasteSummaryOf(owner, appRatings())

/** Pronto's route for the app: the logged-in Dono, the process's engine. */
export const serveRate = (request: Request) => {
  const { owner, origin } = appPoster(request)
  return rateAction(request, owner, appRatings(), origin)
}
