// The Aposta [bet] (#178): the 5th place goes to a Candidate with a good
// Nota prevista and little Evidence, drawn by Thompson sampling over the
// prediction's uncertainty and seeded from the Session id.
//
// In the fixture, only Bruno has taste neighbours, and only once
// `[taste_neighbors]` is lowered (users 10, 20 and 30 of
// `notas_gosto_movielens.csv`). Pequenos Milagres (601) is his one bet:
// the neighbours predict 8,31, an 8,84 once calibrated to his own Notas
// (#210), and he has no Fact on it. The other films
// they predict are ones he rated, with plenty of Evidence.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import {
  answerBillboard,
  answerPairwise,
  billboardModel,
  decidePairwise,
  drawBets,
  pairwiseQuestions,
  parseYaml,
  personRate,
  personSeen,
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
})

describe('the draw', () => {
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
    expect(bet?.predictedRating?.['bruno']?.value).toBeCloseTo(8.84, 2)
  })

  test('reads the calibrated Nota prevista', async () => {
    const fixture = useFixture()
    // 8,5 is above his neighbours' own 8,31 and below the 8,84 calibrated
    // to his Notas: they are harsher than he is.
    const out = await bruno(
      fixture,
      betWeights(fixture, ['min_predicted = 7.0', 'min_predicted = 8.5']),
      { seed: '2026-11-20-bruno' },
    )

    expect(bets(out)).toEqual([[5, PEQUENOS_MILAGRES]])
    expect(out.films[4]?.predictedRating?.['bruno']?.raw).toBeCloseTo(8.31, 2)
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
})

describe('the bet in the Recomendação', () => {
  test('a prediction below `min_predicted` is no bet', async () => {
    const fixture = useFixture()
    const out = await bruno(
      fixture,
      betWeights(fixture, ['min_predicted = 7.0', 'min_predicted = 9.0']),
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
})

describe('the bet in the Recomendação', () => {
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
      predicted_rating: {
        bruno: { value: 8.84, deviation: 0.82, raters: 3 },
      },
      reason: { kind: 'taste', people: ['bruno'] },
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
})

describe('the bet in the Session', () => {
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

const HISTORY_FILM = 'tt9000105'

const pastBet = (
  fixture: Fixture,
  id: string,
  facts: string,
  date = '2026-11-19',
  owner = 'iara',
) => {
  const folder = join(fixture.data, 'sessions')
  mkdirSync(folder, { recursive: true })
  writeFileSync(
    join(folder, `${id}.md`),
    `---
date: ${date}
owner: ${owner}
attendees: [iara, bruno]
rule: {name: default}
recommendation: [{position: 1, id: tt9000101}, {position: 5, id: ${HISTORY_FILM}, bet: true}]
${facts}
---
`,
  )
}

describe('the bet record', () => {
  test('repeated no votes suppress bets for the voter across seeded draws', async () => {
    const fixture = useFixture()
    const vars = betWeights(fixture)
    const seeds = Array.from({ length: 12 }, (_, i) => ({ seed: `next-${i}` }))
    const draw = () =>
      Promise.all(seeds.map((seed) => bruno(fixture, vars, seed)))
    const fresh = await draw()
    for (let i = 1; i <= 20; i++)
      pastBet(
        fixture,
        `swapped-${i}`,
        `swapped: [${HISTORY_FILM}]
votes: [{person: bruno, film: ${HISTORY_FILM}, vote: 'no', date: 2026-11-19}]`,
      )
    const learned = await draw()

    expect(fresh.filter((out) => bets(out).length)).toHaveLength(seeds.length)
    expect(learned.filter((out) => bets(out).length).length).toBeLessThan(4)
    expect((await draw()).map(bets)).toEqual(learned.map(bets))

    for (let i = 1; i <= 25; i++)
      pastBet(
        fixture,
        `liked-${i}`,
        `chosen: ${HISTORY_FILM}
feedback:
  recorded_on: 2026-11-20
  reactions: [{person: bruno, kind: report, reaction: liked}]`,
      )
    expect(
      (await draw()).filter((out) => bets(out).length).length,
    ).toBeGreaterThan(8)
  })
})

describe('the bet record', () => {
  test('a rated Já vi teaches from the Session file and can be corrected', async () => {
    const fixture = useFixture()
    const vars = betWeights(
      fixture,
      ['min_success_rate = 0.25', 'min_success_rate = 0.0'],
      ['min_predicted = 7.0', 'min_predicted = 8.5'],
    )
    const id = 'rated-bet'
    pastBet(fixture, id, '', '2026-11-19', 'bruno')
    const draw = () => bruno(fixture, vars, { seed: 'next-session' })
    expect(bets(await draw())).toEqual([[5, PEQUENOS_MILAGRES]])
    const answer = (rating: number) =>
      fixture.ok(
        answerBillboard({
          session: id,
          text: `#cartaz ${id} v1\n5 ${HISTORY_FILM} · já vi: bruno=${rating}`,
        }),
        vars,
      )

    await answer(2)
    // Use a fresh rebuild of the same fixture's Notas with only the
    // Session file copied from the other workspace.
    const replay = useFixture()
    pastBet(replay, id, '')
    const file = (f: Fixture) => join(f.data, 'sessions', `${id}.md`)
    const replayDraw = () => bruno(replay, vars, { seed: 'next-session' })
    writeFileSync(file(replay), readFileSync(file(fixture)))
    expect(bets(await replayDraw())).toEqual([])

    const reply = await answer(10)
    expect(reply.regenerate).toBe(true)
    const redone = await session(fixture, vars, {
      session: reply.session.id,
      attendees: ['iara', 'bruno'],
      keep: reply.keep,
    })
    expect(redone.dropped).toContainEqual(
      expect.objectContaining({
        id: HISTORY_FILM,
        cause: 'seen',
        people: ['bruno'],
      }),
    )
    writeFileSync(file(replay), readFileSync(file(fixture)))
    expect(bets(await replayDraw())).toEqual([[5, PEQUENOS_MILAGRES]])
  })
})

describe('the bet record', () => {
  test.each(['keep', 'whole screen', 'single swap', 'Cartaz Trocar'])(
    'learns only from an explicit Trocar: %s',
    async (action) => {
      const fixture = useFixture()
      const vars = betWeights(
        fixture,
        ['min_success_rate = 0.25', 'min_success_rate = 0.0'],
        ['min_predicted = 7.0', 'min_predicted = 8.5'],
      )
      const id = 'swap-history'
      pastBet(fixture, id, '', '2026-11-19', 'bruno')
      if (action === 'Cartaz Trocar')
        await fixture.ok(
          answerBillboard({
            session: id,
            text: `#cartaz ${id} v1\n5 ${HISTORY_FILM} · trocar`,
          }),
          vars,
        )
      const redone = await session(fixture, vars, {
        session: id,
        attendees: ['iara', 'bruno'],
        ...(action === 'whole screen'
          ? { swap: ['tt9000101', HISTORY_FILM] }
          : { keep: ['tt9000101'] }),
        ...(action === 'single swap' && { swap: [HISTORY_FILM] }),
      })
      expect(ids(redone)).not.toContain(HISTORY_FILM)
      const next = await bruno(fixture, vars, { seed: 'next-session' })
      expect(bets(next)).toEqual(
        action === 'keep' || action === 'whole screen'
          ? [[5, PEQUENOS_MILAGRES]]
          : [],
      )
    },
  )
})

describe('the bet record', () => {
  test.each(['personSeen', 'personRate'] as const)(
    'learns from a Nota recorded through %s and the drop in the Session file',
    async (action) => {
      const fixture = useFixture()
      const vars = betWeights(
        fixture,
        ['min_success_rate = 0.25', 'min_success_rate = 0.0'],
        ['min_predicted = 7.0', 'min_predicted = 8.0'],
        ['max_predicted_increase = 2.0', 'max_predicted_increase = 10.0'],
      )
      const id = 'seen-in-chat'
      pastBet(fixture, id, '')
      if (action === 'personSeen')
        await fixture.ok(
          personSeen({ person: 'bruno', film: HISTORY_FILM, rating: '2/10' }),
        )
      else
        await fixture.ok(
          personRate({
            person: 'bruno',
            ratings: [{ film: HISTORY_FILM, rating: 2 }],
          }),
        )
      const draw = () => bruno(fixture, vars, { seed: 'next-session' })
      expect(bets(await draw())).toEqual([[5, PEQUENOS_MILAGRES]])

      const redone = await session(fixture, vars, {
        session: id,
        attendees: ['iara', 'bruno'],
        keep: ['tt9000101'],
      })
      expect(redone.dropped).toContainEqual(
        expect.objectContaining({
          id: HISTORY_FILM,
          cause: 'seen',
          people: ['bruno'],
        }),
      )
      const learned = await draw()
      expect(bets(learned)).toEqual([])
      expect(bets(await draw())).toEqual(bets(learned))
    },
  )
})

describe('the bet record', () => {
  test('a Nota from a recorded pairwise answer also teaches through a seen drop', async () => {
    const fixture = useFixture()
    const vars = betWeights(
      fixture,
      ['min_success_rate = 0.25', 'min_success_rate = 0.0'],
      ['min_predicted = 7.0', 'min_predicted = 8.0'],
      ['max_predicted_increase = 2.0', 'max_predicted_increase = 10.0'],
      // Read the pairwise 3.5 as against, so it visibly changes the draw.
      ['weak = 0.4', 'weak = 0.65'],
    )
    const id = 'pairwise-bet'
    pastBet(fixture, id, '', '2026-11-19', 'bruno')
    const { pairs } = await fixture.ok(
      pairwiseQuestions({ session: id, person: 'bruno' }),
      vars,
    )
    const pair = pairs.find((p) => p.some((f) => f.id === HISTORY_FILM))
    if (!pair) throw new Error('the Aposta was not in the pairwise questions')
    await fixture.ok(
      answerPairwise({
        session: id,
        person: 'bruno',
        films: [pair[0].id, pair[1].id],
        choice: HISTORY_FILM,
      }),
      vars,
    )
    await fixture.ok(
      decidePairwise({ session: id, person: 'bruno', record: true }),
      vars,
    )
    const draw = () => bruno(fixture, vars, { seed: 'next-session' })
    expect(bets(await draw())).toEqual([[5, PEQUENOS_MILAGRES]])

    const redone = await session(fixture, vars, {
      session: id,
      attendees: ['iara', 'bruno'],
      keep: ['tt9000101'],
    })
    expect(redone.dropped).toContainEqual(
      expect.objectContaining({
        id: HISTORY_FILM,
        cause: 'seen',
        people: ['bruno'],
      }),
    )
    expect(bets(await draw())).toEqual([])
  })
})

describe('the bet record', () => {
  test('an unrelated earlier Nota does not turn a legacy Já vi into a bet outcome', async () => {
    const fixture = useFixture()
    const vars = betWeights(
      fixture,
      ['min_success_rate = 0.25', 'min_success_rate = 0.0'],
      ['min_predicted = 7.0', 'min_predicted = 8.0'],
      ['max_predicted_increase = 2.0', 'max_predicted_increase = 10.0'],
    )
    await fixture.ok(
      personSeen({
        person: 'bruno',
        film: HISTORY_FILM,
        rating: '2/10',
        date: '2026-11-18',
      }),
    )
    pastBet(fixture, 'unrated-seen', '')
    await fixture.ok(personSeen({ person: 'bruno', film: HISTORY_FILM }))
    const redone = await session(fixture, vars, {
      session: 'unrated-seen',
      attendees: ['iara', 'bruno'],
      keep: ['tt9000101'],
    })
    expect(redone.dropped).toContainEqual(
      expect.objectContaining({
        id: HISTORY_FILM,
        cause: 'seen',
        people: ['bruno'],
      }),
    )
    expect(bets(await bruno(fixture, vars, { seed: 'next-session' }))).toEqual([
      [5, PEQUENOS_MILAGRES],
    ])
  })
})

describe('the bet record', () => {
  test('a good record lowers the minimum predicted rating down to its configured floor', async () => {
    const fixture = useFixture()
    const settings = [
      ['min_success_rate = 0.25', 'min_success_rate = 0.0'],
      ['min_predicted = 7.0', 'min_predicted = 9.0'],
    ] as const
    const draw = (vars: Vars) => bruno(fixture, vars, { seed: 'next-session' })

    expect(bets(await draw(betWeights(fixture, ...settings)))).toEqual([])
    pastBet(
      fixture,
      'liked-bet',
      `chosen: ${HISTORY_FILM}
feedback:
  recorded_on: 2026-11-20
  reactions: [{person: bruno, kind: report, reaction: liked}]`,
    )
    const learned = await draw(betWeights(fixture, ...settings))
    expect(bets(learned)).toEqual([[5, PEQUENOS_MILAGRES]])
    expect(learned.films[4]?.cautiousBet).toBeUndefined()

    const bounded = await draw(
      betWeights(fixture, ...settings, [
        'min_predicted_floor = 6.0',
        'min_predicted_floor = 9.0',
      ]),
    )
    expect(bets(bounded)).toEqual([])
  })
})

describe('the bet record', () => {
  test('the engine explains a cautious bet in the recommendation, Session and Cartaz', async () => {
    const fixture = useFixture()
    const vars = betWeights(fixture, [
      'min_success_rate = 0.25',
      'min_success_rate = 0.0',
    ])
    pastBet(
      fixture,
      'failed-bet',
      `bet_marks: [{person: bruno, film: ${HISTORY_FILM}, kind: swapped, rating: null, date: 2026-11-19}]`,
    )
    const out = await session(fixture, vars, { attendees: ['bruno'] })
    const explanation =
      'O histórico de apostas do grupo pediu uma nota prevista mais alta.'
    const bet = out.films.find((film) => film.bet)
    expect(bet?.cautiousBet).toBe(true)
    expect(bet?.filmLines).toContainEqual(
      expect.objectContaining({ text: explanation, contribution: 0 }),
    )
    expect(
      readFileSync(
        join(fixture.data, 'sessions', `${out.session.id}.md`),
        'utf8',
      ),
    ).toContain(explanation)
    const model = await fixture.ok(
      billboardModel({ session: out.session.id }),
      vars,
    )
    expect(model.films.find((film) => film.bet)?.cautiousBetReason).toBe(
      explanation,
    )
  })

  test('a bet mark with a string Nota does not teach the record', async () => {
    const fixture = useFixture()
    const vars = betWeights(
      fixture,
      ['min_success_rate = 0.25', 'min_success_rate = 0.0'],
      ['min_predicted = 7.0', 'min_predicted = 8.5'],
    )
    pastBet(
      fixture,
      'invalid-mark',
      `bet_marks: [{person: bruno, film: ${HISTORY_FILM}, kind: seen, rating: '1', date: 2026-11-20}]`,
    )
    const out = await bruno(fixture, vars, { seed: 'next-session' })
    expect(bets(out)).toEqual([[5, PEQUENOS_MILAGRES]])
  })
})

describe('the bet record', () => {
  test('a string "false" does not mark a kept bet as cautious', async () => {
    const fixture = useFixture()
    const vars = betWeights(fixture)
    const out = await session(fixture, vars, { attendees: ['bruno'] })
    const id = out.session.id
    const file = join(fixture.data, 'sessions', `${id}.md`)
    const original = readFileSync(file, 'utf8')
    writeFileSync(
      file,
      original.replace('bet: true', "bet: true\n  cautious_bet: 'false'"),
    )

    const model = await fixture.ok(billboardModel({ session: id }), vars)
    expect(
      model.films.find((film) => film.bet)?.cautiousBetReason,
    ).toBeUndefined()
    const redone = await session(fixture, vars, {
      session: id,
      attendees: ['bruno'],
      keep: ids(out),
    })
    expect(bets(redone)).toEqual([[5, PEQUENOS_MILAGRES]])
    expect(redone.films[4]?.cautiousBet).toBeUndefined()
  })

  test('an old owner swap raises the calibrated floor less than a recent one', async () => {
    const fixture = useFixture()
    const vars = betWeights(
      fixture,
      ['min_success_rate = 0.25', 'min_success_rate = 0.0'],
      ['min_predicted = 7.0', 'min_predicted = 8.5'],
    )
    const id = 'swapped-bet'
    const facts = (date: string) => `swapped: [${HISTORY_FILM}]
bet_marks: [{person: bruno, film: ${HISTORY_FILM}, kind: swapped, rating: null, date: ${date}}]`
    const draw = () => bruno(fixture, vars, { seed: 'next-session' })
    pastBet(fixture, id, facts('2011-11-20'), '2011-11-20')
    const old = await draw()
    expect(bets(old)).toEqual([[5, PEQUENOS_MILAGRES]])
    expect(old.films[4]?.cautiousBet).toBe(true)
    pastBet(fixture, id, facts('2026-11-20'), '2026-11-20')
    expect(bets(await draw())).toEqual([])
  })
})
