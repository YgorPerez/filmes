import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  billboardPeople,
  currentVersion,
  filmCards,
  isOpen,
  latestRanking,
  latestVotes,
  pairwiseQuestions,
  readPeople,
  readSession,
  sessionDuration,
  sessionVersions,
  shownFilms,
  yamlToJson,
  type Engine,
  type PublicFilmCard,
  type VoteValue,
  type YamlMapping,
} from '@filmes/engine'
import {
  sessionLinkPath,
  type SessionLinkSearch,
} from '#/content/session-link-address'
import { openAuthDatabase } from './auth-database'
import { attendeeSlugs } from './session-fields'

/** A Presente as the link shows her: her colour and initial are the
 * Cartaz's; `owner` marks who opened the Session. */
export type LinkPerson = {
  person: string
  name: string
  initial: string
  color: number
  owner: boolean
}

/** A film of the current screen, with its public card (null when the
 * Catálogo no longer has it) and the chosen Presente's standing Voto on
 * it. */
export type LinkFilm = {
  position: number
  id: string
  title: string
  card: PublicFilmCard | null
  mine: VoteValue | null
}

/** What anyone with the link sees: no Evidence, Fato or Nota prevista. */
export type SessionLinkView = {
  session: string
  version: number
  /** The Session's day, ISO. */
  date: string
  /** Who opened the Session, when she is among the Presentes' names. */
  owner: string | null
  attendees: LinkPerson[]
  selected: LinkPerson | null
  /** The night's shelf label: the maximum duration and the Climas. */
  shelf: string[]
  /** The current screen, only once a Presente is chosen. */
  films: LinkFilm[]
  /** The films her no took out of the Session, by title. */
  left: string[]
  /** Her Ordem of her latest submission (#379), films of the screen only;
   * absent when she has none. */
  ranking?: string[]
  /** How many Perguntas par a par are left for her (0 without one). */
  questions: number
}

function signingKey(path: string, issue: boolean): Uint8Array | null {
  using db = openAuthDatabase(path)
  const select = db.prepare('SELECT secret FROM session_link_key WHERE id = 1')
  const existing = select.get()
  if (existing?.secret instanceof Uint8Array) return existing.secret
  if (!issue) return null
  // Both images can serve the site during a deploy. Use the key that won.
  db.prepare('INSERT OR IGNORE INTO session_link_key VALUES (1, ?)').run(
    randomBytes(32),
  )
  const created = select.get()?.secret
  return created instanceof Uint8Array ? created : null
}

function sign(session: string, key: Uint8Array) {
  return createHmac('sha256', key)
    .update('session-link:v1\0')
    .update(session)
    .digest('base64url')
}

async function openSession(engine: Engine, session: string) {
  const result = await engine.run(readSession(session))
  if (result.exitCode !== 0 || !isOpen(result.output.frontmatter)) return null
  return result.output.frontmatter
}

/** The shareable address, issued only to the Dono of an open Session. */
export async function issueSessionLink(
  session: string,
  owner: string,
  engine: Engine,
  database: string,
  origin: string | undefined,
): Promise<string | null> {
  if (!origin) return null
  const front = await openSession(engine, session)
  if (front?.get('owner') !== owner) return null
  const key = signingKey(database, true)
  return key
    ? new URL(sessionLinkPath(session, sign(session, key)), origin).href
    : null
}

const text = (value: unknown) => (typeof value === 'string' ? value : null)

/** The Session whose signature `chave` carries, or null: the link was
 * issued for it. */
function signed(
  { sessao, chave }: SessionLinkSearch,
  database: string,
): string | null {
  if (!sessao || chave?.length !== 43 || !/^[\w-]+$/u.test(chave)) return null
  const key = signingKey(database, false)
  return key !== null &&
    timingSafeEqual(Buffer.from(chave), Buffer.from(sign(sessao, key)))
    ? sessao
    : null
}

/** A Session the link was issued for, now closed: its page says the
 * Session ended, with the film the Feedback chose (null for "não vimos
 * nada"), instead of that the link is broken. */
export type ClosedSession = { chosen: string | null } | 'deleted'

/** The closed Session `search` was issued for, or null: a broken link,
 * or a Session still open. */
export async function closedSessionLink(
  search: SessionLinkSearch,
  engine: Engine,
  database: string,
): Promise<ClosedSession | null> {
  const session = signed(search, database)
  if (session === null) return null
  const result = await engine.run(readSession(session))
  if (result.exitCode !== 0)
    return result.output.error.code === 'deleted_session' ? 'deleted' : null
  const front = result.output.frontmatter
  if (isOpen(front)) return null
  const chosen = text(front.get('chosen'))
  if (chosen === null) return { chosen: null }
  const shown = sessionVersions(front)
    .flatMap(shownFilms)
    .find((film) => film.id === chosen)
  const card = (await cardsById(engine, [chosen])).get(chosen)
  return { chosen: card?.title ?? shown?.title ?? chosen }
}

/** The public cards of `ids`, by id; none when the engine could not
 * read them (the page shows the titles alone). */
export async function cardsById(
  engine: Engine,
  ids: readonly string[],
): Promise<ReadonlyMap<string, PublicFilmCard>> {
  const cards = await engine.run(filmCards(ids))
  return new Map(cards.exitCode === 0 ? cards.output.map((c) => [c.id, c]) : [])
}

/** The screen of the current version, with her Votos and the cards. */
async function screenOf(
  front: YamlMapping,
  session: string,
  person: string,
  engine: Engine,
): Promise<Pick<SessionLinkView, 'films' | 'left' | 'questions' | 'ranking'>> {
  const current = currentVersion(front)
  const screen = shownFilms(current)
  const mine = latestVotes(front, person)
  const byId = await cardsById(
    engine,
    screen.map((f) => f.id),
  )
  const titles = new Map(
    sessionVersions(front)
      .flatMap(shownFilms)
      .map((f) => [f.id, f.title ?? f.id]),
  )
  const onScreen = new Set(screen.map((f) => f.id))
  const asked = await engine.run(pairwiseQuestions({ session, person }))
  const ranking = (latestRanking(front, person) ?? []).filter((film) =>
    onScreen.has(film),
  )
  return {
    ...(ranking.length > 0 && { ranking }),
    questions: asked.exitCode === 0 ? asked.output.pairs.length : 0,
    films: screen.map((film) => {
      const card = byId.get(film.id) ?? null
      return {
        position: film.position,
        id: film.id,
        title: card?.title ?? film.title ?? film.id,
        card,
        mine: mine.get(film.id) ?? null,
      }
    }),
    left: [...mine]
      .filter(([film, vote]) => vote === 'no' && !onScreen.has(film))
      .map(([film]) => titles.get(film) ?? film),
  }
}

/** The shelf label's parts: "até 1h50" and the Climas. */
function shelfOf(front: YamlMapping): string[] {
  const context = yamlToJson(front.get('context') ?? null) as Record<
    string,
    unknown
  > | null
  const max = Number(context?.max_duration)
  const moods = Array.isArray(context?.moods) ? context.moods.map(String) : []
  return [...(max > 0 ? [`até ${sessionDuration(max)}`] : []), ...moods]
}

/** Revalidate the capability and current Presentes before returning any data.
 * The anonymous view receives an explicit projection of the Session. */
export async function resolveSessionLink(
  search: SessionLinkSearch,
  engine: Engine,
  database: string,
): Promise<SessionLinkView | null> {
  const sessao = signed(search, database)
  if (sessao === null) return null
  const { presente } = search
  const front = await openSession(engine, sessao)
  if (!front) return null
  const people = await engine.run(readPeople)
  if (people.exitCode !== 0) return null
  const names = new Map(people.output.map((p) => [p.slug, p.name]))
  const owner = text(yamlToJson(front.get('owner') ?? null))
  const attendees: LinkPerson[] = billboardPeople(
    attendeeSlugs(yamlToJson(front.get('attendees') ?? null)),
    names,
    owner,
  ).map(({ slug, name, initial, color, owner: opened }) => ({
    person: slug,
    name,
    initial,
    color,
    owner: opened,
  }))
  const selected = attendees.find((p) => p.person === presente) ?? null
  return {
    session: sessao,
    version: Number(yamlToJson(currentVersion(front).get('version') ?? null)),
    date: String(yamlToJson(front.get('date') ?? null)),
    owner: owner === null ? null : (names.get(owner) ?? null),
    attendees,
    selected,
    shelf: shelfOf(front),
    ...(selected
      ? await screenOf(front, sessao, selected.person, engine)
      : { films: [], left: [], questions: 0 }),
  }
}
