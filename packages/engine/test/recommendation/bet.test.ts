// The Aposta [bet] (#178): the 5th place goes to a Candidate with a good
// Nota prevista and little Evidence, drawn by Thompson sampling over the
// prediction's uncertainty and seeded from the Session id.
//
// In the fixture, only Bruno has taste neighbours, and only once
// `[taste_neighbors]` is lowered (users 10, 20 and 30 of
// `notas_gosto_movielens.csv`). Pequenos Milagres (601) is his one bet:
// the neighbours predict 8,31 and he has no Fact on it. The other films
// they predict are ones he rated, with plenty of Evidence.
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import {
  billboardModel,
  drawBets,
  parseYaml,
  recommendSession,
  yamlToJson,
  type BetCandidate,
  type Recommendation,
  type RecommendSessionRequest,
  type SessionRecommendation,
  type Vars,
} from '../../src/index.ts'
import { ROOT, useFixture, type Fixture } from '../fixture.ts'
import { engineRecommendation } from './support.ts'

const PEQUENOS_MILAGRES = 'tt9000601'

/** `config/weights.toml` with Bruno's taste neighbours on (k 3, 5 films
 * shared), and `more` replacements. */
const betWeights = (
  fixture: Fixture,
  ...more: ReadonlyArray<readonly [string, string]>
): Vars => {
  let text = readFileSync(join(ROOT, 'config/weights.toml'), 'utf8')
  for (const [from, to] of [
    ['k = 50\nmin_shared = 10', 'k = 3\nmin_shared = 5'],
    ...more,
  ] as const) {
    if (!text.includes(from)) throw new Error(`weights.toml has no ${from}`)
    text = text.replace(from, to)
  }
  const file = join(fixture.root, 'weights-test.toml')
  writeFileSync(file, text)
  return { FILMES_PESOS: file }
}

const bets = (out: Recommendation) =>
  out.films.filter((f) => f.bet).map((f) => [f.position, f.id])

const ids = (out: Recommendation) => out.films.map((f) => f.id)

const candidate = (
  id: string,
  value: number,
  deviation: number,
  raters = 1,
): BetCandidate => ({
  id,
  odds: new Map([['bruno', { value, deviation, raters }]]),
})

describe('the draw', () => {
  test('the same seed draws the same order', () => {
    const films = [
      candidate('a', 8, 1.5),
      candidate('b', 8, 1.5),
      candidate('c', 8, 1.5),
    ]
    expect(drawBets('2026-11-20-bruno', films, 7)).toEqual(
      drawBets('2026-11-20-bruno', films, 7),
    )
    const orders = new Set(
      ['s1', 's2', 's3', 's4', 's5', 's6'].map((seed) =>
        drawBets(seed, films, 7).join(),
      ),
    )
    expect(orders.size).toBeGreaterThan(1)
  })

  test('a sure prediction draws its own value', () => {
    expect(
      drawBets('any', [candidate('a', 7.5, 0), candidate('b', 8.5, 0)], 7),
    ).toEqual(['b', 'a'])
  })

  test('an uncertain prediction sometimes beats a better sure one', () => {
    const films = [candidate('sure', 8, 0), candidate('unsure', 7.6, 3)]
    const seeds = Array.from({ length: 200 }, (_, i) => `seed-${i}`)
    const wins = seeds.filter(
      (seed) => drawBets(seed, films, 7)[0] === 'unsure',
    ).length
    // N(7,6; 3) beats 8 with probability 0,45.
    expect(wins).toBeGreaterThan(60)
    expect(wins).toBeLessThan(120)
  })

  test('more neighbours make the prediction surer', () => {
    const films = [candidate('sure', 8, 0), candidate('many', 7.6, 3, 100)]
    const seeds = Array.from({ length: 200 }, (_, i) => `seed-${i}`)
    // N(7,6; 3/√100) beats 8 with probability 0,09.
    const wins = seeds.filter(
      (seed) => drawBets(seed, films, 7)[0] === 'many',
    ).length
    expect(wins).toBeLessThan(40)
  })

  test('a prediction below the minimum is no bet', () => {
    expect(
      drawBets('any', [candidate('a', 6.9, 3), candidate('b', 7, 0)], 7),
    ).toEqual(['b'])
  })

  test('in a group, the mean of the Presentes with a prediction', () => {
    const film: BetCandidate = {
      id: 'a',
      odds: new Map([
        ['bruno', { value: 9, deviation: 0, raters: 3 }],
        ['iara', { value: 4.9, deviation: 0, raters: 3 }],
      ]),
    }
    expect(drawBets('any', [film], 7)).toEqual([])
    expect(drawBets('any', [film], 6.9)).toEqual(['a'])
  })
})

const bruno = (fixture: Fixture, vars: Vars, more: object = {}) =>
  engineRecommendation(fixture, { attendees: ['bruno'], ...more }, vars)

describe('the bet in the Recomendação', () => {
  test('takes the 5th place, below the Regra’s first four', async () => {
    const fixture = useFixture()
    const vars = betWeights(fixture)
    const plain = await bruno(fixture, vars)
    const out = await bruno(fixture, vars, { seed: '2026-11-20-bruno' })

    expect(bets(plain)).toEqual([])
    expect(bets(out)).toEqual([[5, PEQUENOS_MILAGRES]])
    expect(ids(out).slice(0, 4)).toEqual(ids(plain).slice(0, 4))
    expect(ids(plain)).not.toContain(PEQUENOS_MILAGRES)
    const bet = out.films[4]
    expect(bet?.predictedRating?.['bruno']?.value).toBeCloseTo(8.31, 2)
  })

  test('without a Nota prevista there is no bet', async () => {
    const fixture = useFixture()
    const plain = await bruno(fixture, {})
    const out = await bruno(fixture, {}, { seed: '2026-11-20-bruno' })

    expect(bets(out)).toEqual([])
    expect(out.films).toEqual(plain.films)
  })

  test('a Restrição holds for the bet', async () => {
    const fixture = useFixture()
    // Pequenos Milagres runs 1h36.
    const out = await bruno(fixture, betWeights(fixture), {
      seed: '2026-11-20-bruno',
      maxDuration: 95,
    })

    expect(bets(out)).toEqual([])
    expect(ids(out)).not.toContain(PEQUENOS_MILAGRES)
    expect(out.films).toHaveLength(5)
  })

  test('a prediction below `min_predicted` is no bet', async () => {
    const fixture = useFixture()
    const out = await bruno(
      fixture,
      betWeights(fixture, ['min_predicted = 7.0', 'min_predicted = 8.5']),
      { seed: '2026-11-20-bruno' },
    )

    expect(bets(out)).toEqual([])
  })

  test('a list shorter than the bet’s place has none', async () => {
    const fixture = useFixture()
    const out = await bruno(fixture, betWeights(fixture), {
      seed: '2026-11-20-bruno',
      count: 4,
    })

    expect(bets(out)).toEqual([])
  })

  test('a longer list keeps the bet at its place', async () => {
    const fixture = useFixture()
    const vars = betWeights(fixture)
    const plain = await bruno(fixture, vars, { count: 8 })
    const out = await bruno(fixture, vars, {
      seed: '2026-11-20-bruno',
      count: 8,
    })

    expect(bets(out)).toEqual([[5, PEQUENOS_MILAGRES]])
    expect(ids(out).filter((id) => id !== PEQUENOS_MILAGRES)).toEqual(
      ids(plain).slice(0, 7),
    )
  })

  test('with MMR on, MMR picks the other places and leaves the bet', async () => {
    const fixture = useFixture()
    const vars = betWeights(fixture, ['lambda = 1.0', 'lambda = 0.5'])
    const plain = await bruno(fixture, vars, { count: 4 })
    const out = await bruno(fixture, vars, { seed: '2026-11-20-bruno' })

    expect(bets(out)).toEqual([[5, PEQUENOS_MILAGRES]])
    expect(ids(out).slice(0, 4)).toEqual(ids(plain))
  })

  test('position 0 turns the bet off', async () => {
    const fixture = useFixture()
    const out = await bruno(
      fixture,
      betWeights(fixture, ['position = 5', 'position = 0']),
      { seed: '2026-11-20-bruno' },
    )

    expect(bets(out)).toEqual([])
  })
})

const session = async (
  fixture: Fixture,
  vars: Vars,
  request: RecommendSessionRequest,
): Promise<SessionRecommendation> =>
  JSON.parse(
    JSON.stringify(await fixture.ok(recommendSession(request), vars)),
  ) as SessionRecommendation

const front = (fixture: Fixture, id: string) => {
  const text = readFileSync(join(fixture.data, 'sessions', `${id}.md`), 'utf8')
  return yamlToJson(parseYaml(text.slice(4, text.indexOf('\n---', 4)))) as {
    recommendation: Array<Record<string, unknown>>
  }
}

describe('the bet in the Session', () => {
  test('is drawn from the Session id and kept in its file', async () => {
    const fixture = useFixture()
    const vars = betWeights(fixture)
    const out = await session(fixture, vars, { attendees: ['bruno'] })

    expect(bets(out)).toEqual([[5, PEQUENOS_MILAGRES]])
    expect(front(fixture, out.session.id).recommendation[4]).toEqual({
      position: 5,
      id: PEQUENOS_MILAGRES,
      title: 'Pequenos Milagres',
      bet: true,
    })
    expect(front(fixture, out.session.id).recommendation[0]).not.toHaveProperty(
      'bet',
    )
  })

  test('the Cartaz marks it', async () => {
    const fixture = useFixture()
    const vars = betWeights(fixture)
    const out = await session(fixture, vars, { attendees: ['bruno'] })

    const model = await fixture.ok(
      billboardModel({ session: out.session.id }),
      vars,
    )
    expect(model.films.map((f) => f.bet)).toEqual([
      false,
      false,
      false,
      false,
      true,
    ])
  })

  test('redoing the Session draws the same bet', async () => {
    const fixture = useFixture()
    const vars = betWeights(fixture)
    const first = await session(fixture, vars, { attendees: ['bruno'] })
    const again = await session(fixture, vars, {
      session: first.session.id,
      attendees: ['bruno'],
    })

    expect(bets(again)).toEqual([[5, PEQUENOS_MILAGRES]])
  })

  test('a kept bet stays the bet', async () => {
    const fixture = useFixture()
    const vars = betWeights(fixture)
    const first = await session(fixture, vars, { attendees: ['bruno'] })
    const [swapped, ...rest] = ids(first)
    const next = await session(fixture, vars, {
      session: first.session.id,
      attendees: ['bruno'],
      keep: rest,
      swap: [swapped ?? ''],
    })

    expect(bets(next)).toEqual([[5, PEQUENOS_MILAGRES]])
    expect(next.films[0]?.new).toBe(true)
  })

  test('a swapped bet leaves the Session and the place goes back to the Regra', async () => {
    const fixture = useFixture()
    const vars = betWeights(fixture)
    const first = await session(fixture, vars, { attendees: ['bruno'] })
    const next = await session(fixture, vars, {
      session: first.session.id,
      attendees: ['bruno'],
      keep: ids(first).slice(0, 4),
      swap: [PEQUENOS_MILAGRES],
    })

    expect(ids(next)).not.toContain(PEQUENOS_MILAGRES)
    expect(bets(next)).toEqual([])
    expect(next.films).toHaveLength(5)
    expect(next.dropped).toEqual([
      {
        position: 5,
        id: PEQUENOS_MILAGRES,
        title: 'Pequenos Milagres',
        cause: 'swapped',
      },
    ])
  })
})
