// The group swipe on the Link da Sessão (#182). A Presente votes yes or no
// on each film of the screen and puts her yes films in her Ordem (#379);
// the deck's form posts the Votos (`sim`, `nao`) and the Ordem (`ordem`,
// in order) to `/participar/votos`. A no is a Trocar from that Presente:
// the Session is redone with the films that stay (`recommendSession` with
// `keep`, from the request the current version asked). An Ordem can also
// redo the Session on its own by changing the order. Votos never touch taste. Server only.
// Each film of the deck carries its full sheet (#377): the public facts for
// anyone, and only the chosen Presente's own Evidence and Nota prevista.
//
// Every post revalidates the link first (`resolveSessionLink`, with a
// Presente chosen) and takes only a form of this site (`same-site.ts`). The Session is
// derived from the link, never from the form. Votos and the redo of one
// Session run one after another, so a redo always keeps the films of the
// screen that is current when it starts.

import {
  billboardModel,
  castVotes,
  readSession,
  recommendSession,
  sessionRedoRequest,
  sessionVersions,
  shownFilms,
  type BillboardFilm,
  type BillboardPerson,
  type Engine,
} from '@filmes/engine'
import {
  sessionLinkPath,
  sessionLinkSearch,
} from '#/content/session-link-address'
import {
  votePath,
  type VoteNotice,
  type VoteRefusal,
} from '#/content/session-votes-address'
import { logEngineError } from './engine-log'
import { failureOf, seeOther } from './form-post'
import { resolveSessionLink, type SessionLinkView } from './session-link'
import { fromThisSite } from './same-site'

/** The full sheet of a film (#377), as the Cartaz's card has it: the
 * public facts, and the Evidence and Nota prevista of whoever looks only
 * (a Presente sees her own, the Dono everyone's). */
export type FilmSheet = Pick<
  BillboardFilm,
  | 'imdbUrl'
  | 'trailer'
  | 'imdbRatingText'
  | 'votesText'
  | 'chips'
  | 'awards'
  | 'critics'
  | 'synopsis'
  | 'lines'
  | 'withoutFact'
  | 'coverage'
  | 'predictedRatings'
  | 'cautiousBetReason'
>

/** The sheets of the Session's films, by id, and the Presentes they name
 * (whoever looks is "Você"): `viewer`'s own, or everyone's for the Dono.
 * None when the engine could not build them (the deck shows the public
 * card alone). */
export async function filmSheets(
  engine: Engine,
  session: string,
  /** A Presente's slug, or `all` for the Dono. */
  viewer: string,
): Promise<{
  people: BillboardPerson[]
  sheets: ReadonlyMap<string, FilmSheet>
}> {
  const made = await engine.run(
    billboardModel(
      viewer === 'all' ? { session } : { session, viewers: [viewer] },
    ),
    viewer === 'all' ? {} : { owner: viewer },
  )
  if (made.exitCode !== 0) {
    logEngineError(made)
    return { people: [], sheets: new Map() }
  }
  const { attendees, films } = made.output
  return {
    people: attendees.filter((p) => viewer === 'all' || p.slug === viewer),
    sheets: new Map(films.map((film) => [film.id, sheetOf(film)])),
  }
}

const sheetOf = (film: BillboardFilm): FilmSheet => ({
  imdbUrl: film.imdbUrl,
  ...(film.trailer !== undefined && { trailer: film.trailer }),
  imdbRatingText: film.imdbRatingText,
  votesText: film.votesText,
  chips: film.chips,
  ...(film.awards !== undefined && { awards: film.awards }),
  ...(film.critics !== undefined && { critics: film.critics }),
  synopsis: film.synopsis,
  lines: film.lines,
  withoutFact: film.withoutFact,
  coverage: film.coverage,
  predictedRatings: film.predictedRatings,
  ...(film.cautiousBetReason !== undefined && {
    cautiousBetReason: film.cautiousBetReason,
  }),
})

/** A film of the deck: the link's, and its full sheet (null when the
 * engine could not build it). */
export type DeckFilm = SessionLinkView['films'][number] & {
  sheet: FilmSheet | null
}

/** What the deck shows the chosen Presente: the current version, the
 * films of its screen with her standing Voto on each (the deck asks for
 * the ones she has not voted on, and sends the rest again, since her
 * latest submission is the one that counts) and its full sheet, the
 * Presentes the sheets name, what her no took out, and, by title, the
 * films her last sim went to after they had left the screen (`stale`: an
 * older deck, while another Presente's no redid the Session; pass 4 F3). */
export type VoteDeck = Pick<SessionLinkView, 'version' | 'left' | 'ranking'> & {
  films: DeckFilm[]
  people: BillboardPerson[]
  stale?: string[]
}

export async function voteDeck(
  search: ReturnType<typeof sessionLinkSearch> & { fora?: string | undefined },
  engine: Engine,
  database: string,
): Promise<VoteDeck | null> {
  const link = await resolveSessionLink(search, engine, database)
  if (!link?.selected) return null
  const { people, sheets } = await filmSheets(
    engine,
    link.session,
    link.selected.person,
  )
  const deck = {
    version: link.version,
    films: link.films.map((film) => ({
      ...film,
      sheet: sheets.get(film.id) ?? null,
    })),
    people,
    left: link.left,
    ...(link.ranking && { ranking: link.ranking }),
  }
  const asked = search.fora?.split(',') ?? []
  if (asked.length === 0) return deck
  const onScreen = new Set(link.films.map((f) => f.id))
  const stale = await shownTitles(
    engine,
    link.session,
    (id) => asked.includes(id) && !onScreen.has(id),
  )
  return stale.length > 0 ? { ...deck, stale } : deck
}

/** The titles of the films some version of the Session showed that
 * `pick` takes, once each: only a film the Session showed is named. */
async function shownTitles(
  engine: Engine,
  session: string,
  pick: (id: string) => boolean,
): Promise<string[]> {
  const read = await engine.run(readSession(session))
  if (read.exitCode !== 0) return []
  const titles = new Map(
    sessionVersions(read.output.frontmatter)
      .flatMap(shownFilms)
      .filter((f) => pick(f.id))
      .map((f) => [f.id, f.title ?? f.id]),
  )
  return [...titles.values()]
}

/** One Session's Votos and redo at a time, in this process. */
const queues = new Map<string, Promise<unknown>>()

function oneAtATime<A>(session: string, task: () => Promise<A>): Promise<A> {
  const run = (queues.get(session) ?? Promise.resolve()).then(task, task)
  const settled = run.catch(() => undefined)
  queues.set(session, settled)
  void settled.then(() => {
    if (queues.get(session) === settled) queues.delete(session)
  })
  return run
}

const filmsOf = (form: FormData, name: string) =>
  form.getAll(name).filter((v): v is string => typeof v === 'string')

/** The Sessão redone after the votes, with `keep` kept; false when the
 * engine could not redo it. */
async function redoKeeping(
  engine: Engine,
  session: string,
  keep: readonly string[],
): Promise<boolean> {
  const asked = await engine.run(sessionRedoRequest(session))
  if (asked.exitCode !== 0) {
    logEngineError(asked)
    return false
  }
  const redone = await engine.run(
    recommendSession({ ...asked.output, keep: [keep.join(',')] }),
  )
  if (redone.exitCode !== 0) logEngineError(redone)
  return redone.exitCode === 0
}

/** `POST /participar/votos?sessao=…&chave=…&presente=…`: records the
 * chosen Presente's Votos, redoes the Session if a film left or the order
 * changed, and returns to the deck with what happened. */
export async function voteAction(
  request: Request,
  engine: Engine,
  database: string,
  origin: string | undefined,
): Promise<Response> {
  if (!fromThisSite(request, origin))
    return new Response('Origem recusada', { status: 403 })
  const search = sessionLinkSearch(
    Object.fromEntries(new URL(request.url).searchParams),
  )
  const back = () =>
    seeOther(
      search.sessao && search.chave
        ? sessionLinkPath(search.sessao, search.chave, search.presente)
        : '/participar',
    )
  const form = await request.formData()
  return oneAtATime(search.sessao ?? '', async () => {
    const link = await resolveSessionLink(search, engine, database)
    if (!link?.selected) return back()
    const onScreen = new Set(link.films.map((f) => f.id))
    // A sim on a film that already left: the engine skips it, and the
    // deck says so.
    const stale = filmsOf(form, 'sim').filter((film) => !onScreen.has(film))
    const deck = (outcome: { feito?: VoteNotice; erro?: VoteRefusal }) =>
      seeOther(
        votePath(
          'votar',
          search,
          stale.length > 0 && outcome.feito
            ? { ...outcome, fora: stale.slice(0, 10).join(',') }
            : outcome,
        ),
      )
    const votes = [
      ...filmsOf(form, 'sim').map((film) => ({ film, vote: 'yes' as const })),
      ...filmsOf(form, 'nao').map((film) => ({ film, vote: 'no' as const })),
    ]
    const cast = await engine.run(
      castVotes({
        session: link.session,
        person: link.selected.person,
        version: Number(form.get('versao')) || link.version,
        votes,
        ranking: filmsOf(form, 'ordem'),
      }),
    )
    if (cast.exitCode !== 0) {
      logEngineError(cast)
      return deck({ erro: failureOf(cast) })
    }
    if (!cast.output.regenerate) return deck({ feito: 'votado' })
    if (!(await redoKeeping(engine, link.session, cast.output.keep)))
      return deck({ erro: 'regerar' })
    return deck({
      feito: cast.output.dropped.length > 0 ? 'regerada' : 'atualizada',
    })
  })
}
