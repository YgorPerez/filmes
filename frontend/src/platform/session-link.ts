import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import {
  currentVersion,
  isOpen,
  readPeople,
  readSession,
  yamlToJson,
  type Engine,
} from '@filmes/engine'
import {
  sessionLinkPath,
  type SessionLinkSearch,
} from '#/content/session-link-address'
import { openAuthDatabase } from './auth-database'
import { attendeeSlugs, sessionFilms } from './session-fields'

type Attendee = { person: string; name: string }

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

/** Revalidate the capability and current Presentes before returning any data.
 * The anonymous view receives an explicit projection of the Session. */
export async function resolveSessionLink(
  { sessao, chave, presente }: SessionLinkSearch,
  engine: Engine,
  database: string,
) {
  if (!sessao || chave?.length !== 43 || !/^[\w-]+$/u.test(chave)) return null
  const key = signingKey(database, false)
  if (
    key === null ||
    !timingSafeEqual(Buffer.from(chave), Buffer.from(sign(sessao, key)))
  )
    return null

  const front = await openSession(engine, sessao)
  if (!front) return null
  const people = await engine.run(readPeople)
  if (people.exitCode !== 0) return null
  const names = new Map(people.output.map((p) => [p.slug, p.name]))
  const attendees: Attendee[] = attendeeSlugs(
    yamlToJson(front.get('attendees') ?? null),
  ).map((person) => ({ person, name: names.get(person) ?? person }))
  const selected = attendees.find((p) => p.person === presente) ?? null
  return {
    session: sessao,
    version: Number(yamlToJson(currentVersion(front).get('version') ?? null)),
    attendees,
    selected,
    films: selected
      ? sessionFilms(yamlToJson(front.get('recommendation') ?? null))
      : [],
  }
}
