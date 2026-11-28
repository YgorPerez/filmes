// The Ordem of the group swipe (#379): after the deck, each Presente puts
// her yes films in the order she wants them, and the Session's list follows
// the lowest sum of positions over the Presentes who ranked. A film a
// ranker has not placed counts as the middle of her list; ties, or nobody
// ranked yet, go by the Regra de escolha.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import {
  castVotes,
  latestRanking,
  parseYaml,
  readSession,
  recommendSession,
  yamlToJson,
  type CastVotes,
  type SessionRecommendation,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'

const open = async (fixture: Fixture) => {
  const out = await fixture.ok(
    recommendSession({ attendees: ['dono', 'iara'] }),
  )
  const attendees: string[] = front(fixture, out.session.id).attendees
  return {
    id: out.session.id,
    f: out.films.map((film) => film.id),
    owner: attendees.find((p) => p !== 'iara')!,
  }
}

const front = (fixture: Fixture, id: string) => {
  const text = readFileSync(join(fixture.data, 'sessions', `${id}.md`), 'utf8')
  return yamlToJson(
    parseYaml(text.slice(4, text.indexOf('\n---', 4))),
  ) as Record<string, any>
}

/** `person` says yes to `order`, in that Ordem, and no to `no`. */
const rank = async (
  fixture: Fixture,
  session: string,
  person: string,
  version: number,
  order: ReadonlyArray<string>,
  no: ReadonlyArray<string> = [],
): Promise<CastVotes> =>
  JSON.parse(
    JSON.stringify(
      await fixture.ok(
        castVotes({
          session,
          person,
          version,
          votes: [
            ...order.map((film) => ({ film, vote: 'yes' as const })),
            ...no.map((film) => ({ film, vote: 'no' as const })),
          ],
          ranking: order,
        }),
      ),
    ),
  ) as CastVotes

const redo = async (
  fixture: Fixture,
  session: string,
  keep: ReadonlyArray<string>,
): Promise<string[]> => {
  const out = JSON.parse(
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
  return out.films.map((film) => film.id)
}

describe('the Ordem of the group', () => {
  test('the list follows the lowest sum of positions over everyone who ranked', async () => {
    const fixture = useFixture()
    const { id, f, owner } = await open(fixture)
    const [a, b, c, d, e] = f as [string, string, string, string, string]
    await rank(fixture, id, 'iara', 1, [c, a, b, d, e])
    const out = await rank(fixture, id, owner, 1, [a, d, c, b, e])

    // a 2+1, c 1+3, d 4+2, b 3+4, e 5+5
    expect(out.regenerate).toBe(true)
    expect(out.dropped).toEqual([])
    expect(await redo(fixture, id, out.keep)).toEqual([a, c, d, b, e])
  })

  test('a film she has not placed counts as the middle of her list', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture)
    const [a, b, c, d, e] = f as [string, string, string, string, string]
    // Four placed: the middle is 2,5, between d (2) and c (3).
    const out = await rank(fixture, id, 'iara', 1, [e, d, c, b])

    expect(await redo(fixture, id, out.keep)).toEqual([e, d, a, c, b])
  })

  test('a tie goes by the Regra de escolha, not by the screen', async () => {
    const fixture = useFixture()
    const { id, f, owner } = await open(fixture)
    const [a, b, c, d, e] = f as [string, string, string, string, string]
    const first = await rank(fixture, id, 'iara', 1, [c, a, b, d, e])
    expect(await redo(fixture, id, first.keep)).toEqual([c, a, b, d, e])

    // a 2+1 and c 1+2: the Regra put a above c.
    const out = await rank(fixture, id, owner, 2, [a, c, b, d, e])

    expect(out.regenerate).toBe(true)
    expect(await redo(fixture, id, out.keep)).toEqual([a, c, b, d, e])
  })

  test('an Ordem in the screen’s order calls for no new version', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture)

    const out = await rank(fixture, id, 'iara', 1, f)

    expect(out.regenerate).toBe(false)
    expect(front(fixture, id).versions).toBeUndefined()
  })

  test('a não from the Ordem swaps the film and the rest follows her Ordem', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture)
    const [a, b, c, d, e] = f as [string, string, string, string, string]
    await rank(fixture, id, 'iara', 1, [c, b, a, d, e])

    const out = await rank(fixture, id, 'iara', 1, [e, d, b, a], [c])

    expect(out.dropped).toEqual([
      expect.objectContaining({ id: c, cause: 'swapped' }),
    ])
    const ids = await redo(fixture, id, out.keep)
    expect([ids[0], ids[1], ids[3], ids[4]]).toEqual([e, d, b, a])
    expect(f).not.toContain(ids[2])
  })

  test('her Ordem goes with her latest submission, and only films of the screen count', async () => {
    const fixture = useFixture()
    const { id, f } = await open(fixture)
    const [a, b, c] = f as [string, string, string]
    await rank(fixture, id, 'iara', 1, [a, b])
    await rank(fixture, id, 'iara', 1, [c, a, 'tt0000001'])

    const { frontmatter } = await fixture.ok(readSession(id))
    expect(latestRanking(frontmatter, 'iara')).toEqual([c, a])
    expect(latestRanking(frontmatter, 'dono')).toBeNull()

    await fixture.ok(
      castVotes({
        session: id,
        person: 'iara',
        version: 1,
        votes: [{ film: b, vote: 'yes' }],
      }),
    )
    const later = await fixture.ok(readSession(id))
    expect(latestRanking(later.frontmatter, 'iara')).toBeNull()
  })
})
