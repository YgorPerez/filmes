import { join } from 'node:path'
import { makeEngine, recommendSession, recordFeedback } from '@filmes/engine'
import { expect, test } from 'vite-plus/test'
import { useFixture } from '../../../packages/engine/test/fixture'
import { sessionLinkSearch } from '#/content/session-link-address'
import {
  closedSessionLink,
  issueSessionLink,
  resolveSessionLink,
} from './session-link'

test('the public Session link follows the current version until Feedback closes it', async () => {
  const fixture = useFixture()
  const engine = makeEngine(fixture.vars)
  const database = join(fixture.root, 'auth.sqlite')
  const origin = 'https://cinema.example'
  try {
    const first = await fixture.ok(
      recommendSession({ attendees: ['dono', 'iara'], count: 2 }),
      {},
      { owner: 'bruno' },
    )
    const session = first.session.id
    const issue = (owner: string, site = origin) =>
      issueSessionLink(session, owner, engine, database, site)
    const read = (search: Record<string, unknown>) =>
      resolveSessionLink(sessionLinkSearch(search), engine, database)
    expect(await issue('bruno', '')).toBeNull()
    expect(await issue('vera')).toBeNull()
    expect(await read({ sessao: session, chave: 'x'.repeat(43) })).toBeNull()

    const url = await issue('bruno')
    if (!url) throw new Error('Expected a Session link')
    expect(await issue('bruno')).toBe(url)
    const search = Object.fromEntries(new URL(url).searchParams)
    expect(await read({ ...search, chave: ['x'] })).toBeNull()
    expect(await read({ ...search, chave: '!'.repeat(43) })).toBeNull()
    expect(await read({ ...search, sessao: 'another-session' })).toBeNull()
    const bruno = { person: 'bruno', name: 'Bruno', initial: 'B', color: 1 }
    expect(await read(search)).toEqual({
      session,
      version: 1,
      date: '2026-11-20',
      owner: 'Bruno',
      attendees: [
        { ...bruno, owner: true },
        { person: 'iara', name: 'Iara', initial: 'I', color: 2, owner: false },
      ],
      selected: null,
      shelf: [],
      films: [],
      left: [],
      questions: 0,
    })

    const second = await fixture.ok(
      recommendSession({ session, attendees: ['dono', 'quim'], count: 1 }),
      {},
      { owner: 'bruno' },
    )
    expect(await read({ ...search, presente: 'iara' })).toMatchObject({
      version: 2,
      selected: null,
      films: [],
    })
    const film = second.films[0]!
    const quim = {
      person: 'quim',
      name: 'Quim',
      initial: 'Q',
      color: 2,
      owner: false,
    }
    const asQuim = await read({ ...search, presente: 'quim' })
    expect(asQuim).toMatchObject({
      session,
      version: 2,
      attendees: [{ ...bruno, owner: true }, quim],
      selected: quim,
      films: [
        {
          position: 1,
          id: film.id,
          title: film.title,
          new: true,
          mine: null,
          card: expect.objectContaining({ id: film.id }),
        },
      ],
      left: [],
    })
    // Only the public card: no Evidence, Fato or Nota prevista.
    expect(JSON.stringify(asQuim)).not.toMatch(/evidence|utility|predicted/u)

    await fixture.ok(
      recordFeedback({ session, film: null }),
      {},
      { owner: 'bruno' },
    )
    expect(await issue('bruno')).toBeNull()
    expect(await read({ ...search, presente: 'quim' })).toBeNull()
    // The closed Session is told apart from a broken link.
    const closed = (search: Record<string, unknown>) =>
      closedSessionLink(sessionLinkSearch(search), engine, database)
    expect(await closed(search)).toBe(true)
    expect(await closed({ ...search, chave: 'x'.repeat(43) })).toBe(false)
    expect(await closed({ ...search, sessao: 'another-session' })).toBe(false)
  } finally {
    await engine.dispose()
  }
})
