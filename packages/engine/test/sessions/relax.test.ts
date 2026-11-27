// Relax when short (#358, map #355): when fewer films pass than the count,
// the engine relaxes the Parecido first, then the year Restrição, until the
// list is full or nothing is left to relax. The similar films still come
// first, and the version says what came in.

import { expect, test } from 'vite-plus/test'
import {
  billboard,
  recommendSession,
  type RecommendSessionRequest,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'

const ESCREVER_CARTAS = 'tt9006701' // 4 similar films pass its Restrições

const recommend = (fixture: Fixture, request: RecommendSessionRequest) =>
  fixture.ok(recommendSession(request))

const ids = (out: { films: ReadonlyArray<{ id: string }> }) =>
  out.films.map((film) => film.id)

test('a short Parecido fills the list with films that are not similar, after the similar ones', async () => {
  const fixture = useFixture()
  const similar = await recommend(fixture, {
    attendees: ['dono'],
    similar: [ESCREVER_CARTAS],
    count: 4,
  })
  const out = await recommend(fixture, {
    attendees: ['dono'],
    similar: [ESCREVER_CARTAS],
    count: 10,
  })

  expect(similar.shortfall).toBeUndefined()
  expect(out.films).toHaveLength(10)
  expect(ids(out).slice(0, 4).toSorted()).toEqual(ids(similar).toSorted())
  expect(out.shortfall).toEqual({
    asked: 10,
    found: 10,
    similar: ['Escrever Cartas'],
    relaxed: [
      { constraint: 'similar', films: 6, text: 'que não são parecidos' },
    ],
  })
})

test('without a Parecido, a short year range lets in films from before it, after the ones inside', async () => {
  const fixture = useFixture()
  const out = await recommend(fixture, {
    attendees: ['dono'],
    since: 2024,
    count: 10,
  })

  expect(out.films).toHaveLength(10)
  expect(out.films[0]?.year).toBeGreaterThanOrEqual(2024)
  expect(out.films.slice(1).every((film) => (film.year ?? 0) < 2024)).toBe(true)
  expect(out.shortfall?.relaxed).toEqual([
    { constraint: 'year', films: 9, text: 'de antes de 2024' },
  ])
})

test('the Parecido relaxes first, and the year only when that is not enough', async () => {
  const fixture = useFixture()
  const out = await recommend(fixture, {
    attendees: ['dono'],
    similar: [ESCREVER_CARTAS],
    since: 2023,
    count: 10,
  })
  const inRange = out.films.filter((film) => (film.year ?? 0) >= 2023)

  expect(out.films).toHaveLength(10)
  expect(ids(out).slice(0, inRange.length)).toEqual(ids({ films: inRange }))
  expect(out.shortfall?.relaxed.map((r) => r.constraint)).toEqual([
    'similar',
    'year',
  ])
  expect(out.shortfall?.relaxed.at(-1)?.text).toBe('de antes de 2023')
})

test('a redo keeps the size of the version it replaces, relaxing again, with the kept films at their numbers', async () => {
  const fixture = useFixture()
  const first = await recommend(fixture, {
    attendees: ['dono'],
    similar: [ESCREVER_CARTAS],
    count: 8,
  })
  const p = ids(first)
  const keep = [p[0], p[2], p[5], p[6]].join(',')

  const redone = await recommend(fixture, {
    attendees: ['dono'],
    session: first.session.id,
    keep: [keep],
  })

  expect(redone.films).toHaveLength(8)
  const at = new Map(redone.films.map((f) => [f.position, f.id]))
  expect([1, 3, 6, 7].map((n) => at.get(n))).toEqual([p[0], p[2], p[5], p[6]])
  expect(redone.constraints['similar']?.['films']).toEqual([ESCREVER_CARTAS])
  expect(redone.shortfall?.relaxed.map((r) => r.constraint)).toEqual([
    'similar',
  ])
})

test('the Cartaz says what ran out and what came in', async () => {
  const fixture = useFixture()
  const out = await recommend(fixture, {
    attendees: ['dono'],
    similar: [ESCREVER_CARTAS],
    since: 2023,
    count: 10,
  })
  const cartaz = await fixture.ok(billboard({ session: out.session.id }))
  const [similar, year] = out.shortfall?.relaxed ?? []

  expect(cartaz.billboard.shortfall).toBe(
    `Acabaram os parecidos com Escrever Cartas; entraram ${similar?.films} que não são parecidos e entraram ${year?.films} de antes de 2023.`,
  )
})

test.each([
  { range: { until: 2005 }, count: 10, text: 'de depois de 2005' },
  {
    range: { since: 2012, until: 2013 },
    count: 40,
    text: 'de fora de 2012 a 2013',
  },
  { range: { since: 2013, until: 2013 }, count: 40, text: 'de outros anos' },
])(
  'the films from outside $range are $text',
  async ({ range, count, text }) => {
    const out = await recommend(useFixture(), {
      attendees: ['dono'],
      count,
      ...range,
    })

    expect(out.films).toHaveLength(count)
    expect(out.shortfall?.relaxed.map((r) => r.text)).toEqual([text])
  },
)
