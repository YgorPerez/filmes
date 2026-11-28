import { join } from 'node:path'
import { makeEngine, recommendSession, recordFeedback } from '@filmes/engine'
import { expect, test } from 'vite-plus/test'
import { useFixture } from '../../../packages/engine/test/fixture'
import { sessionLinkSearch } from '#/content/session-link-address'
import { issueSessionLink, resolveSessionLink } from './session-link'
import { voteAction, voteDeck } from './session-votes'

const ORIGIN = 'https://cinema.example'

test('a Presente’s no swaps the film and redoes the Session; her yes stays and leaves her deck', async () => {
  const fixture = useFixture()
  const engine = makeEngine(fixture.vars)
  const database = join(fixture.root, 'auth.sqlite')
  try {
    const first = await fixture.ok(
      recommendSession({ attendees: ['dono', 'iara'], count: 3 }),
      {},
      { owner: 'bruno' },
    )
    const session = first.session.id
    const [a, b, c] = first.films.map((f) => f.id)
    const url = await issueSessionLink(
      session,
      'bruno',
      engine,
      database,
      ORIGIN,
    )
    if (!url) throw new Error('Expected a Session link')
    const link = Object.fromEntries(new URL(url).searchParams)
    const as = (presente?: string) =>
      presente === undefined ? link : { ...link, presente }
    // The opener votes logged in (#376); the guests, without a login.
    // The link's pages send no referrer, so a browser posts their form
    // with `Origin: null` and says where it came from in `Sec-Fetch-Site`.
    const post = (
      search: Record<string, string>,
      body: string,
      from: Record<string, string> = {
        origin: 'null',
        'sec-fetch-site': 'same-origin',
      },
    ) =>
      voteAction(
        new Request(
          `${ORIGIN}/participar/votos?${new URLSearchParams(search)}`,
          {
            method: 'POST',
            headers: {
              ...from,
              'content-type': 'application/x-www-form-urlencoded',
            },
            body,
          },
        ),
        engine,
        database,
        ORIGIN,
        search.presente === 'bruno' ? 'bruno' : null,
      )
    const deck = (presente: string) =>
      voteDeck(
        sessionLinkSearch(as(presente)),
        engine,
        database,
        presente === 'bruno' ? 'bruno' : null,
      )
    const films = async () =>
      (
        await resolveSessionLink(
          sessionLinkSearch(as('bruno')),
          engine,
          database,
          'bruno',
        )
      )?.films.map((f) => f.id)

    const refused = (from: Record<string, string>) =>
      post(as('iara'), `versao=1&nao=${b}`, from).then((r) => r.status)
    expect(
      await refused({ origin: 'null', 'sec-fetch-site': 'cross-site' }),
    ).toBe(403)
    expect(await refused({ origin: 'https://evil.example' })).toBe(403)
    expect(await refused({ origin: 'null' })).toBe(403)
    const anonymous = await post(as(), `versao=1&nao=${b}`)
    expect(anonymous.status).toBe(303)
    expect(anonymous.headers.get('location')).toMatch(/^\/participar\?/)
    expect(await films()).toEqual([a, b, c])

    expect(await deck('iara')).toMatchObject({
      version: 1,
      films: first.films.map(({ position, id, title }) => ({
        position,
        id,
        title,
        mine: null,
        card: expect.objectContaining({ id, year: expect.any(Number) }),
      })),
      left: [],
    })

    const nowhere = await post({}, `versao=1&nao=${b}`)
    expect(nowhere.headers.get('location')).toBe('/participar')
    const refusedVersion = await post(as('iara'), `versao=9&nao=${b}`)
    expect(
      new URL(
        refusedVersion.headers.get('location') ?? '',
        ORIGIN,
      ).searchParams.get('erro'),
    ).toBe('indisponivel')
    expect(await films()).toEqual([a, b, c])

    const voted = await post(as('iara'), `versao=1&sim=${a}&nao=${b}`)
    expect(voted.status).toBe(303)
    const back = new URL(voted.headers.get('location') ?? '', ORIGIN)
    expect(back.pathname).toBe('/participar/votar')
    expect(Object.fromEntries(back.searchParams)).toEqual({
      ...as('iara'),
      feito: 'regerada',
    })
    const now = await films()
    expect(now).toHaveLength(3)
    expect(now).toContain(a)
    expect(now).toContain(c)
    expect(now).not.toContain(b)

    // Her yes stands on the film that stayed; her no took the other out.
    const mine = await deck('iara')
    expect(mine?.version).toBe(2)
    expect(mine?.films.map((f) => f.id)).toEqual(now)
    expect(
      mine?.films.filter((f) => f.mine).map((f) => [f.id, f.mine]),
    ).toEqual([[a, 'yes']])
    expect(mine?.left).toEqual([first.films[1]?.title])
    expect((await deck('bruno'))?.films.map((f) => f.id)).toEqual(now)

    const yes = await post(as('bruno'), `versao=2&sim=${c}`, {
      origin: ORIGIN,
    })
    expect(
      new URL(yes.headers.get('location') ?? '', ORIGIN).searchParams.get(
        'feito',
      ),
    ).toBe('atualizada')
    const newcomer = now?.find((film) => film !== a && film !== c)
    expect(await films()).toEqual([a, c, newcomer])
    expect((await deck('bruno'))?.version).toBe(3)

    const repeated = await post(as('bruno'), `versao=3&sim=${c}`)
    expect(
      new URL(repeated.headers.get('location') ?? '', ORIGIN).searchParams.get(
        'feito',
      ),
    ).toBe('votado')
    expect((await deck('bruno'))?.version).toBe(3)

    await fixture.ok(
      recordFeedback({ session, film: null }),
      {},
      { owner: 'bruno' },
    )
    const closed = await post(as('iara'), `versao=2&nao=${c}`)
    expect(closed.headers.get('location')).toMatch(/^\/participar\?/)
    expect(await deck('iara')).toBeNull()
  } finally {
    await engine.dispose()
  }
})

test('two Presentes posting at once both count', async () => {
  const fixture = useFixture()
  const engine = makeEngine(fixture.vars)
  const database = join(fixture.root, 'auth.sqlite')
  try {
    const first = await fixture.ok(
      recommendSession({ attendees: ['dono', 'iara'], count: 3 }),
      {},
      { owner: 'bruno' },
    )
    const session = first.session.id
    const [a, b, c] = first.films.map((f) => f.id)
    const url = await issueSessionLink(
      session,
      'bruno',
      engine,
      database,
      ORIGIN,
    )
    if (!url) throw new Error('Expected a Session link')
    const link = Object.fromEntries(new URL(url).searchParams)
    const post = (presente: string, body: string) =>
      voteAction(
        new Request(
          `${ORIGIN}/participar/votos?${new URLSearchParams({ ...link, presente })}`,
          {
            method: 'POST',
            headers: {
              origin: ORIGIN,
              'content-type': 'application/x-www-form-urlencoded',
            },
            body,
          },
        ),
        engine,
        database,
        ORIGIN,
        presente === 'bruno' ? 'bruno' : null,
      )

    const answers = await Promise.all([
      post('iara', `versao=1&nao=${a}`),
      post('bruno', `versao=1&nao=${c}`),
    ])

    expect(
      answers.map((r) =>
        new URL(r.headers.get('location') ?? '', ORIGIN).searchParams.get(
          'feito',
        ),
      ),
    ).toEqual(['regerada', 'regerada'])
    const films = (
      await resolveSessionLink(
        sessionLinkSearch({ ...link, presente: 'bruno' }),
        engine,
        database,
        'bruno',
      )
    )?.films.map((f) => f.id)
    expect(films).toHaveLength(3)
    expect(films).toContain(b)
    expect(films).not.toContain(a)
    expect(films).not.toContain(c)
  } finally {
    await engine.dispose()
  }
})

test('a sim from an older deck on a film that already left is named on the deck', async () => {
  const fixture = useFixture()
  const engine = makeEngine(fixture.vars)
  const database = join(fixture.root, 'auth.sqlite')
  try {
    const first = await fixture.ok(
      recommendSession({ attendees: ['dono', 'iara'], count: 3 }),
      {},
      { owner: 'bruno' },
    )
    const session = first.session.id
    const [a, b] = first.films.map((f) => f.id)
    const url = await issueSessionLink(
      session,
      'bruno',
      engine,
      database,
      ORIGIN,
    )
    if (!url) throw new Error('Expected a Session link')
    const link = Object.fromEntries(new URL(url).searchParams)
    const post = (presente: string, body: string) =>
      voteAction(
        new Request(
          `${ORIGIN}/participar/votos?${new URLSearchParams({ ...link, presente })}`,
          {
            method: 'POST',
            headers: {
              origin: ORIGIN,
              'content-type': 'application/x-www-form-urlencoded',
            },
            body,
          },
        ),
        engine,
        database,
        ORIGIN,
        presente === 'bruno' ? 'bruno' : null,
      )
    const where = (r: Response) =>
      new URL(r.headers.get('location') ?? '', ORIGIN).searchParams

    await post('iara', `versao=1&nao=${b}`)
    // Bruno's deck still showed version 1: his sim on b came too late.
    const late = where(await post('bruno', `versao=1&sim=${a}&sim=${b}`))
    expect(late.get('fora')).toBe(b)
    const deck = await voteDeck(
      sessionLinkSearch({ ...link, presente: 'bruno' }),
      engine,
      database,
      'bruno',
    )
    expect(deck?.version).toBe(2)
    expect(deck?.stale).toBeUndefined()
    const told = await voteDeck(
      {
        ...sessionLinkSearch({ ...link, presente: 'bruno' }),
        fora: `${b},${a},zz`,
      },
      engine,
      database,
      'bruno',
    )
    // Only a film the Session showed and no longer shows is named.
    expect(told?.stale).toEqual([first.films[1]?.title])

    const onTime = where(await post('iara', `versao=2&sim=${a}`))
    expect(onTime.get('fora')).toBeNull()
  } finally {
    await engine.dispose()
  }
})

test('only the logged-in Dono votes as the opener; a visitor with the link cannot', async () => {
  const fixture = useFixture()
  const engine = makeEngine(fixture.vars)
  const database = join(fixture.root, 'auth.sqlite')
  try {
    const first = await fixture.ok(
      recommendSession({ attendees: ['dono', 'iara'], count: 3 }),
      {},
      { owner: 'bruno' },
    )
    const session = first.session.id
    const [a, b, c] = first.films.map((f) => f.id)
    const url = await issueSessionLink(
      session,
      'bruno',
      engine,
      database,
      ORIGIN,
    )
    if (!url) throw new Error('Expected a Session link')
    // The Votar button's address: the link's swipe, as the opener.
    const asOpener = { ...Object.fromEntries(new URL(url).searchParams), presente: 'bruno' }
    const post = (viewer: string | null, body: string) =>
      voteAction(
        new Request(
          `${ORIGIN}/participar/votos?${new URLSearchParams(asOpener)}`,
          {
            method: 'POST',
            headers: {
              origin: ORIGIN,
              'content-type': 'application/x-www-form-urlencoded',
            },
            body,
          },
        ),
        engine,
        database,
        ORIGIN,
        viewer,
      )
    const films = async () =>
      (
        await resolveSessionLink(
          sessionLinkSearch(asOpener),
          engine,
          database,
          'bruno',
        )
      )?.films.map((f) => f.id)

    // Logged out, or logged in as another Dono: the link does not open as
    // her, and nothing is recorded.
    for (const viewer of [null, 'vera']) {
      expect(
        (await resolveSessionLink(sessionLinkSearch(asOpener), engine, database, viewer))
          ?.selected,
      ).toBeNull()
      expect(await voteDeck(sessionLinkSearch(asOpener), engine, database, viewer)).toBeNull()
      const refused = await post(viewer, `versao=1&nao=${b}`)
      expect(refused.status).toBe(303)
      expect(refused.headers.get('location')).toMatch(/^\/participar\?/)
      expect(await films()).toEqual([a, b, c])
    }

    // Logged in as her: her deck, and her no swaps the film as a guest's.
    expect(
      (await voteDeck(sessionLinkSearch(asOpener), engine, database, 'bruno'))?.films,
    ).toHaveLength(3)
    const voted = await post('bruno', `versao=1&sim=${a}&nao=${b}`)
    expect(
      new URL(voted.headers.get('location') ?? '', ORIGIN).searchParams.get(
        'feito',
      ),
    ).toBe('regerada')
    const now = await films()
    expect(now).toContain(a)
    expect(now).not.toContain(b)
  } finally {
    await engine.dispose()
  }
})
