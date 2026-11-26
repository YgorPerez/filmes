import { join } from 'node:path'
import { makeEngine, recommendSession, recordFeedback } from '@filmes/engine'
import { expect, test } from 'vite-plus/test'
import { useFixture } from '../../../packages/engine/test/fixture'
import { sessionLinkSearch } from '#/content/session-link-address'
import { issueSessionLink, resolveSessionLink } from './session-link'

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
    expect(await read(search)).toEqual({
      session,
      version: 1,
      attendees: [
        { person: 'bruno', name: 'Bruno' },
        { person: 'iara', name: 'Iara' },
      ],
      selected: null,
      films: [],
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
    expect(await read({ ...search, presente: 'quim' })).toEqual({
      session,
      version: 2,
      attendees: [
        { person: 'bruno', name: 'Bruno' },
        { person: 'quim', name: 'Quim' },
      ],
      selected: { person: 'quim', name: 'Quim' },
      films: [{ position: 1, id: film.id, title: film.title }],
    })

    await fixture.ok(
      recordFeedback({ session, film: null }),
      {},
      { owner: 'bruno' },
    )
    expect(await issue('bruno')).toBeNull()
    expect(await read({ ...search, presente: 'quim' })).toBeNull()
  } finally {
    await engine.dispose()
  }
})
