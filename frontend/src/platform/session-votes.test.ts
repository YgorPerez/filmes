import { join } from 'node:path'
import { makeEngine, recommendSession, recordFeedback } from '@filmes/engine'
import { expect, test } from 'vite-plus/test'
import { useFixture } from '../../../packages/engine/test/fixture'
import { tasteWeights } from '../../../packages/engine/test/recommendation/support'
import { sessionLinkSearch } from '#/content/session-link-address'
import { issueSessionLink, resolveSessionLink } from './session-link'
import { filmSheets, voteAction, voteDeck } from './session-votes'

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
      )
    const deck = (presente: string) =>
      voteDeck(sessionLinkSearch(as(presente)), engine, database)
    const films = async () =>
      (
        await resolveSessionLink(
          sessionLinkSearch(as('bruno')),
          engine,
          database,
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

    // Her Ordem (#379) goes in `ordem`, in order, and moves the films.
    const newcomer = now?.find((film) => film !== a && film !== c)
    const ranked = [a, c, newcomer]
      .map((film) => `sim=${film}&ordem=${film}`)
      .join('&')
    const yes = await post(as('bruno'), `versao=2&${ranked}`, {
      origin: ORIGIN,
    })
    expect(
      new URL(yes.headers.get('location') ?? '', ORIGIN).searchParams.get(
        'feito',
      ),
    ).toBe('atualizada')
    expect(await films()).toEqual([a, c, newcomer])
    expect((await deck('bruno'))?.version).toBe(3)
    expect((await deck('bruno'))?.ranking).toEqual([a, c, newcomer])
    expect((await deck('iara'))?.ranking).toBeUndefined()

    const repeated = await post(as('bruno'), `versao=3&${ranked}`)
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
    )
    expect(deck?.stale).toBeUndefined()
    const told = await voteDeck(
      {
        ...sessionLinkSearch({ ...link, presente: 'bruno' }),
        fora: `${b},${a},zz`,
      },
      engine,
      database,
    )
    // Only a film the Session showed and no longer shows is named.
    expect(told?.stale).toEqual([first.films[1]?.title])

    const onTime = where(await post('iara', `versao=2&sim=${a}`))
    expect(onTime.get('fora')).toBeNull()
  } finally {
    await engine.dispose()
  }
})

test('the deck’s sheet has the public facts and only her own Evidence and Nota prevista; the Dono’s has everyone’s', async () => {
  const fixture = useFixture()
  const engine = makeEngine(fixture.vars)
  const database = join(fixture.root, 'auth.sqlite')
  try {
    const opened = await fixture.ok(
      recommendSession({ attendees: ['bruno', 'teo'], count: 50 }),
      tasteWeights(fixture, 3, 5),
      { owner: 'bruno' },
    )
    const session = opened.session.id
    const url = await issueSessionLink(
      session,
      'bruno',
      engine,
      database,
      ORIGIN,
    )
    if (!url) throw new Error('Expected a Session link')
    const link = Object.fromEntries(new URL(url).searchParams)
    const film = opened.films.find((f) => f.title === 'Pequenos Milagres')!

    const teo = await voteDeck(
      sessionLinkSearch({ ...link, presente: 'teo' }),
      engine,
      database,
    )
    const owner = await filmSheets(engine, session, 'all')

    expect(teo?.people.map((p) => [p.slug, p.label])).toEqual([['teo', 'Você']])
    const sheet = teo?.films.find((f) => f.id === film.id)?.sheet
    expect(sheet).toMatchObject({
      imdbUrl: expect.stringContaining(film.id),
      votesText: expect.any(String),
      predictedRatings: [],
    })
    for (const f of teo?.films ?? []) {
      expect(f.sheet?.lines.flatMap((l) => l.people) ?? []).not.toContain(
        'bruno',
      )
      expect(f.sheet?.predictedRatings).toEqual([])
    }
    expect(owner.people.map((p) => [p.slug, p.label])).toEqual([
      ['bruno', 'Você'],
      ['teo', 'Teo'],
    ])
    expect(
      owner.sheets.get(film.id)?.predictedRatings.map((p) => p.person),
    ).toEqual(['bruno'])
  } finally {
    await engine.dispose()
  }
})
