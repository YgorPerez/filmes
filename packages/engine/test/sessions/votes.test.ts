// The Votos of the group swipe (#182): each Presente says yes or no to the
// films of the screen through the Link da Sessão. A no is a Trocar from
// that Presente; a yes can move kept films and redo the Session on its
// own (#205). Votos are no Fato and never touch taste.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import {
  castVotes,
  parseYaml,
  readSession,
  personView,
  recommendSession,
  recordFeedback,
  votedBy,
  yamlToJson,
  type CastVotes,
  type CastVotesRequest,
  type SessionRecommendation,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'

const open = async (fixture: Fixture) => {
  const out = await fixture.ok(
    recommendSession({ attendees: ['dono', 'iara'] }),
  )
  const attendees: string[] = front(fixture, out.session.id).attendees
  return { id: out.session.id, f: out.films.map((film) => film.id), attendees }
}

const vote = async (
  fixture: Fixture,
  request: CastVotesRequest,
): Promise<CastVotes> =>
  JSON.parse(JSON.stringify(await fixture.ok(castVotes(request)))) as CastVotes

const redo = async (
  fixture: Fixture,
  session: string,
  keep: readonly string[],
) =>
  JSON.parse(
    JSON.stringify(
      await fixture.ok(
        recommendSession({
          session,
          attendees: ['dono', 'iara'],
          keep: [keep.join(',')],
        }),
      ),
    ),
  ) as SessionRecommendation

const front = (fixture: Fixture, id: string) => {
  const text = readFileSync(join(fixture.data, 'sessions', `${id}.md`), 'utf8')
  return yamlToJson(
    parseYaml(text.slice(4, text.indexOf('\n---', 4))),
  ) as Record<string, any>
}

describe('castVotes', () => {
  test('yes votes alone put the most-voted film first and keep the whole screen', async () => {
    const fixture = useFixture()
    const { id, f, attendees } = await open(fixture)
    await vote(fixture, {
      session: id,
      person: attendees.find((p) => p !== 'iara')!,
      version: 1,
      votes: [
        { film: f[0]!, vote: 'yes' },
        { film: f[1]!, vote: 'yes' },
      ],
    })
    const out = await vote(fixture, {
      session: id,
      person: 'iara',
      version: 1,
      votes: [
        { film: f[3]!, vote: 'yes' },
        { film: f[1]!, vote: 'yes' },
      ],
    })
    expect(out.regenerate).toBe(true)
    expect(out.dropped).toEqual([])

    const redone = await redo(fixture, id, out.keep)
    expect(redone.session.version).toBe(2)
    expect(redone.films.map((film) => film.id)).toEqual([
      f[1],
      f[0],
      f[3],
      f[2],
      f[4],
    ])
    expect(redone.dropped).toEqual([])
  })

  test('a Presente’s latest vote set replaces the previous version’s votes', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture)
    const first = await vote(fixture, {
      session: id,
      person: 'iara',
      version: 1,
      votes: [{ film: f[3]!, vote: 'yes' }],
    })
    const second = await redo(fixture, id, first.keep)
    expect(second.films[0]?.id).toBe(f[3])

    const latest = await vote(fixture, {
      session: id,
      person: 'iara',
      version: 2,
      votes: [{ film: f[2]!, vote: 'yes' }],
    })
    expect(latest.regenerate).toBe(true)
    const third = await redo(fixture, id, latest.keep)
    expect(third.films.map((film) => film.id)).toEqual([
      f[2],
      f[3],
      f[0],
      f[1],
      f[4],
    ])
  })

  test('equal yes counts keep the current order without a new version', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture)
    const out = await vote(fixture, {
      session: id,
      person: 'iara',
      version: 1,
      votes: f.toReversed().map((film) => ({ film, vote: 'yes' })),
    })

    expect(out.regenerate).toBe(false)
    expect(out.keep).toEqual(f)
    expect(front(fixture, id).versions).toBeUndefined()
  })

  test('a Restrição still removes an ineligible kept film when yes votes call for a redo', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture)
    const out = await vote(fixture, {
      session: id,
      person: 'iara',
      version: 1,
      votes: [
        { film: f[1]!, vote: 'yes' },
        { film: f[3]!, vote: 'yes' },
      ],
    })
    expect(out.regenerate).toBe(true)

    const redone = await fixture.ok(
      recommendSession({
        session: id,
        attendees: ['dono', 'iara'],
        keep: out.keep,
        maxDuration: 110,
      }),
    )
    expect(redone.films.map((film) => film.id)).not.toContain(f[1])
    expect(redone.films.findIndex((film) => film.id === f[3])).toBeLessThan(
      redone.films.findIndex((film) => film.id === f[0]),
    )
    expect(redone.dropped).toContainEqual(
      expect.objectContaining({
        id: f[1],
        cause: 'constraint',
        constraint: 'duration',
      }),
    )
  })

  test('a no swaps the film and the rest stays, in screen order', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture)

    const out = await vote(fixture, {
      session: id,
      person: 'iara',
      version: 1,
      votes: [
        { film: f[1]!, vote: 'no' },
        { film: f[3]!, vote: 'yes' },
      ],
    })

    expect(out.regenerate).toBe(true)
    expect(out.keep).toEqual([f[0], f[2], f[3], f[4]])
    expect(out.dropped).toEqual([
      expect.objectContaining({ id: f[1], position: 2, cause: 'swapped' }),
    ])
    expect(front(fixture, id).swapped).toEqual([f[1]])
    expect(front(fixture, id).votes).toEqual([
      {
        person: 'iara',
        film: f[1],
        vote: 'no',
        date: '2026-11-20',
        replaces: true,
      },
      { person: 'iara', film: f[3], vote: 'yes', date: '2026-11-20' },
    ])
  })

  test('a yes lifts the kept film to the first kept number; free places stay', async () => {
    const fixture = useFixture()
    const { id, f, attendees } = await open(fixture)
    await vote(fixture, {
      session: id,
      person: 'iara',
      version: 1,
      votes: [{ film: f[3]!, vote: 'yes' }],
    })
    const out = await vote(fixture, {
      session: id,
      person: attendees.find((p) => p !== 'iara')!,
      version: 1,
      votes: [{ film: f[1]!, vote: 'no' }],
    })

    const redone = await redo(fixture, id, out.keep)

    const ids = redone.films.map((film) => film.id)
    expect([ids[0], ids[2], ids[3], ids[4]]).toEqual([f[3], f[0], f[2], f[4]])
    expect(f).not.toContain(ids[1])
  })

  test('a vote on a film no longer on the screen is skipped with a warning', async () => {
    const fixture = useFixture()
    const { id, f, attendees } = await open(fixture)
    const owner = attendees.find((p) => p !== 'iara')!
    const first = await vote(fixture, {
      session: id,
      person: owner,
      version: 1,
      votes: [{ film: f[0]!, vote: 'no' }],
    })
    await redo(fixture, id, first.keep)

    const out = await vote(fixture, {
      session: id,
      person: 'iara',
      version: 1,
      votes: [
        { film: f[0]!, vote: 'no' },
        { film: f[2]!, vote: 'no' },
      ],
    })

    expect(out.currentVersion).toBe(2)
    expect(out.dropped.map((d) => d.id)).toEqual([f[2]])
    expect(out.warnings).toEqual([
      `voto em ${f[0]} ignorado: o filme não está mais na tela da versão 2`,
    ])
  })

  test('a no still swaps the film after a Presente voted yes on it', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture)
    const ask = (v: 'yes' | 'no') =>
      vote(fixture, {
        session: id,
        person: 'iara',
        version: 1,
        votes: [{ film: f[2]!, vote: v }],
      })
    await ask('yes')
    const latest = await ask('no')
    expect(latest.dropped).toEqual([
      expect.objectContaining({ id: f[2], position: 3, cause: 'swapped' }),
    ])
    expect(front(fixture, id).swapped).toEqual([f[2]])
  })

  test('only a Presente of the current version votes', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture)

    const out = await fixture.run(
      castVotes({
        session: id,
        person: 'rosa',
        version: 1,
        votes: [{ film: f[0]!, vote: 'no' }],
      }),
    )

    expect(out.exitCode).toBe(2)
    expect(front(fixture, id).votes).toBeUndefined()
  })

  test('a closed Session takes no vote', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture)
    await fixture.ok(recordFeedback({ session: id, film: f[0]! }))

    const out = await fixture.run(
      castVotes({
        session: id,
        person: 'iara',
        version: 1,
        votes: [{ film: f[1]!, vote: 'no' }],
      }),
    )

    expect(out.output).toMatchObject({ error: { code: 'closed_session' } })
  })

  test('votes are no Fato: the Presente’s taste does not change', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture)
    const before = await fixture.ok(personView('iara'))

    await vote(fixture, {
      session: id,
      person: 'iara',
      version: 1,
      votes: [
        { film: f[0]!, vote: 'yes' },
        { film: f[1]!, vote: 'no' },
      ],
    })

    expect(await fixture.ok(personView('iara'))).toEqual(before)
  })

  test('a version the Session does not have, or an unknown Session, is invalid usage', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture)
    const ask = (session: string, version: number) =>
      fixture.run(
        castVotes({
          session,
          person: 'iara',
          version,
          votes: [{ film: f[0]!, vote: 'no' }],
        }),
      )

    expect((await ask(id, 2)).output).toMatchObject({
      error: {
        code: 'invalid_usage',
        message: `a Sessão ${id} não tem a versão 2`,
      },
    })
    expect((await ask('2026-01-01-ninguem', 1)).exitCode).not.toBe(0)
    expect(front(fixture, id).votes).toBeUndefined()
  })

  test('votedBy says which films a Presente voted on in any version', async () => {
    const fixture = useFixture()
    const { id, f, attendees } = await open(fixture)
    const owner = attendees.find((p) => p !== 'iara')!
    const first = await vote(fixture, {
      session: id,
      person: 'iara',
      version: 1,
      votes: [
        { film: f[0]!, vote: 'yes' },
        { film: f[1]!, vote: 'no' },
      ],
    })
    await redo(fixture, id, first.keep)
    await vote(fixture, {
      session: id,
      person: owner,
      version: 2,
      votes: [{ film: f[2]!, vote: 'yes' }],
    })

    const { frontmatter } = await fixture.ok(readSession(id))
    expect([...votedBy(frontmatter, 'iara')]).toEqual([f[0], f[1]])
    expect([...votedBy(frontmatter, owner)]).toEqual([f[2]])
  })

  test('two Presentes’ no in the same version are both swapped; votes off the screen write nothing but still redo', async () => {
    const fixture = useFixture()
    const { id, f, attendees } = await open(fixture)
    const owner = attendees.find((p) => p !== 'iara')!
    const no = (person: string, film: string) =>
      vote(fixture, {
        session: id,
        person,
        version: 1,
        votes: [{ film, vote: 'no' }],
      })
    await no('iara', f[3]!)
    await no(owner, f[1]!)
    const before = front(fixture, id)

    const off = await no('iara', 'tt0000001')

    expect(before.swapped).toEqual([f[1], f[3]].toSorted())
    expect(front(fixture, id)).toEqual(before)
    // Nobody redid the Session after those no: this post does.
    expect(off.regenerate).toBe(true)
    expect(off.keep).toEqual([f[0], f[2], f[4]])
  })
})
