// Vi e gostei / Vi e não gostei (#378): the swipe's up and down. The film
// leaves the group list at once, like the Cartaz's Já vi, and becomes a Já
// visto plus a Declarado without a number for that Presente. The Dono's go
// into her file at once; a guest's wait in the Session for the Dono's yes,
// next to the Perguntas par a par.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import {
  castVotes,
  decidePairwise,
  deleteSession,
  pairwiseAnswers,
  parseYaml,
  personView,
  recommendSession,
  yamlToJson,
  type CastVotes,
  type CastVotesRequest,
  type SessionRecommendation,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'

const front = (fixture: Fixture, id: string) => {
  const text = readFileSync(join(fixture.data, 'sessions', `${id}.md`), 'utf8')
  return yamlToJson(
    parseYaml(text.slice(4, text.indexOf('\n---', 4))),
  ) as Record<string, any>
}

/** A Session of the Dono and Iara, opened by the Dono. */
const open = async (fixture: Fixture) => {
  const out = await fixture.ok(
    recommendSession({ attendees: ['dono', 'iara'] }),
  )
  const id = out.session.id
  return {
    id,
    f: out.films.map((film) => film.id),
    titles: out.films.map((film) => film.title),
    owner: String(front(fixture, id).owner),
  }
}

const vote = async (fixture: Fixture, request: CastVotesRequest) =>
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

const fromSession = (id: string) => (item: { source: string }) =>
  item.source.includes(id)

describe('seen gestures', () => {
  test('the Dono’s vi e gostei takes the film out for everyone and lands in her file at once', async () => {
    const fixture = useFixture()
    const { id, f, owner } = await open(fixture)

    const out = await vote(fixture, {
      session: id,
      person: owner,
      version: 1,
      votes: [{ film: f[0]!, vote: 'yes' }],
      seen: [{ film: f[2]!, reaction: 'like' }],
    })

    expect(out.regenerate).toBe(true)
    expect(out.keep).toEqual([f[0], f[1], f[3], f[4]])
    expect(out.dropped).toEqual([
      expect.objectContaining({
        id: f[2],
        position: 3,
        cause: 'seen',
        people: [owner],
      }),
    ])

    const view = await fixture.ok(personView(owner))
    expect(view.seen.filter(fromSession(id))).toEqual([
      expect.objectContaining({ film: f[2], rating: null }),
    ])
    expect(view.stated.filter(fromSession(id))).toEqual([
      expect.objectContaining({
        target: f[2],
        reaction: 'like',
        specific: true,
      }),
    ])
    // Nothing waits for her own yes.
    expect(await fixture.ok(pairwiseAnswers(id))).toEqual([])

    const redone = await redo(fixture, id, out.keep)
    expect(redone.films.map((film) => film.id)).not.toContain(f[2])
    expect(redone.films).toHaveLength(5)
    expect(redone.dropped).toEqual([
      expect.objectContaining({ id: f[2], cause: 'seen', people: [owner] }),
    ])
  })

  test('a guest’s vi e não gostei takes the film out at once but waits for the Dono’s yes', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture)
    const before = await fixture.ok(personView('iara'))

    const out = await vote(fixture, {
      session: id,
      person: 'iara',
      version: 1,
      votes: [],
      seen: [{ film: f[1]!, reaction: 'dislike' }],
    })

    expect(out.dropped).toEqual([
      expect.objectContaining({ id: f[1], cause: 'seen', people: ['iara'] }),
    ])
    // Her taste waits: nothing in her file yet.
    expect(await fixture.ok(personView('iara'))).toEqual(before)

    const redone = await redo(fixture, id, out.keep)
    expect(redone.films.map((film) => film.id)).not.toContain(f[1])
    expect(redone.dropped).toEqual([
      expect.objectContaining({ id: f[1], cause: 'seen', people: ['iara'] }),
    ])
    // Out for the rest of the Session, also when nobody keeps anything.
    const again = await fixture.ok(
      recommendSession({ session: id, attendees: ['dono', 'iara'] }),
    )
    expect(again.films.map((film) => film.id)).not.toContain(f[1])

    expect(await fixture.ok(pairwiseAnswers(id))).toEqual([
      {
        person: 'iara',
        name: 'Iara',
        answers: [],
        seen: [
          {
            film: expect.objectContaining({ id: f[1] }),
            reaction: 'dislike',
          },
        ],
      },
    ])

    await fixture.ok(
      decidePairwise({ session: id, person: 'iara', record: true }),
    )
    const view = await fixture.ok(personView('iara'))
    expect(view.seen.filter(fromSession(id))).toEqual([
      expect.objectContaining({ film: f[1], rating: null }),
    ])
    expect(view.stated.filter(fromSession(id))).toEqual([
      expect.objectContaining({ target: f[1], reaction: 'dislike' }),
    ])
    expect(await fixture.ok(pairwiseAnswers(id))).toEqual([])
  })

  test('a discarded guest’s gesture writes no taste and the film stays out', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture)
    const before = await fixture.ok(personView('iara'))
    const out = await vote(fixture, {
      session: id,
      person: 'iara',
      version: 1,
      votes: [],
      seen: [{ film: f[4]!, reaction: 'like' }],
    })

    await fixture.ok(
      decidePairwise({ session: id, person: 'iara', record: false }),
    )

    expect(await fixture.ok(personView('iara'))).toEqual(before)
    expect(await fixture.ok(pairwiseAnswers(id))).toEqual([])
    const redone = await redo(fixture, id, out.keep)
    expect(redone.films.map((film) => film.id)).not.toContain(f[4])
  })

  test('a gesture on a film off the screen is skipped with a warning', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture)

    const out = await vote(fixture, {
      session: id,
      person: 'iara',
      version: 1,
      votes: [{ film: f[0]!, vote: 'yes' }],
      seen: [{ film: 'tt0000001', reaction: 'like' }],
    })

    expect(out.dropped).toEqual([])
    expect(out.warnings).toEqual([
      'vi tt0000001 ignorado: o filme não está mais na tela da versão 1',
    ])
    expect(front(fixture, id).seen_gestures).toBeUndefined()
  })

  test('a gesture wins over a Voto on the same film', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture)

    const out = await vote(fixture, {
      session: id,
      person: 'iara',
      version: 1,
      votes: [
        { film: f[3]!, vote: 'no' },
        { film: f[0]!, vote: 'yes' },
      ],
      seen: [{ film: f[3]!, reaction: 'like' }],
    })

    expect(out.dropped).toEqual([
      expect.objectContaining({ id: f[3], cause: 'seen', people: ['iara'] }),
    ])
    expect(front(fixture, id).swapped).toBeUndefined()
    expect(front(fixture, id).votes).toEqual([
      expect.objectContaining({ film: f[0], vote: 'yes' }),
    ])
  })

  test('deleting the Session and keeping the taste discards the gestures that wait', async () => {
    const fixture = useFixture()
    const { id, f, owner } = await open(fixture)
    await vote(fixture, {
      session: id,
      person: 'iara',
      version: 1,
      votes: [],
      seen: [{ film: f[0]!, reaction: 'like' }],
    })
    await vote(fixture, {
      session: id,
      person: owner,
      version: 1,
      votes: [],
      seen: [{ film: f[1]!, reaction: 'dislike' }],
    })

    await fixture.ok(
      deleteSession({ session: id, mode: 'keep_taste' }),
      {},
      {
        owner,
      },
    )

    expect(front(fixture, id).seen_gestures).toEqual([
      expect.objectContaining({ person: 'iara', discarded_on: '2026-11-20' }),
      expect.objectContaining({ person: owner, recorded_on: '2026-11-20' }),
    ])
  })
})
