// The taste neighbours (#174): the MovieLens users of the fixture's sample
// (`notas_gosto_movielens.csv`) closest to a Pessoa by the percentiles of
// the films they share, and what they gave a Candidate. Users 10, 20 and 30
// rate Bruno's films as he does, user 40 the other way round, user 50
// shares only 2 of his films, and user 60 shares 4, against him only on his
// oldest Nota. All of them rated Pequenos Milagres (601)
// and Deserto Branco (701), where Bruno has no Fact. Nobody shares the
// default minimum of 10 films with him, so the other tests do not see them.
import { describe, expect, test } from 'vite-plus/test'
import {
  answerPairwise,
  decidePairwise,
  pairwiseQuestions,
  recommendSession,
  type Recommendation,
  type Vars,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'
import {
  engineRecommendation,
  film,
  tasteWeights,
  weightsWith,
} from './support.ts'

const bruno = (fixture: Fixture, vars: Vars) =>
  engineRecommendation(fixture, { attendees: ['bruno'], count: 50 }, vars)

const neighbours = (out: Recommendation, title: string) =>
  (film(out, title).evidence['bruno'] ?? []).filter((e) =>
    e.text.includes('gosto parecido'),
  )

describe('the taste neighbours path', () => {
  test('the closest neighbours speak for the film they liked', async () => {
    const fixture = useFixture()
    // No Decaimento, for the worked contribution below.
    const out = await bruno(
      fixture,
      weightsWith(fixture, 'k = 50\nmin_shared = 10', 'k = 3\nmin_shared = 5', [
        ['floor = 0.25', 'floor = 1.0'],
      ]),
    )

    const [e] = neighbours(out, 'Pequenos Milagres')
    // Users 10, 20 and 30 gave it 5, 4,5 and 5; user 40, who rates the
    // other way round, is not among the 3 closest.
    expect(e?.text).toBe(
      '3 pessoas de gosto parecido deram 4,8 em média a este',
    )
    expect([e?.strength, e?.kind, e?.source, e?.date]).toEqual([
      'weak',
      'review',
      'MovieLens ml-32m',
      '2023-10-13',
    ])
    // Their mean percentile is 0,817: weight × 2 × (0,817 − 0,5), weak.
    expect(e?.contribution).toBeCloseTo(0.3 * 2 * (0.8167 - 0.5), 3)
  })

  test('and against the film they disliked', async () => {
    const fixture = useFixture()
    const out = await bruno(fixture, tasteWeights(fixture, 3, 5))

    const [e] = neighbours(out, 'Deserto Branco')
    expect(e?.text).toBe(
      '3 pessoas de gosto parecido deram 1,5 em média a este',
    )
    expect(e?.contribution).toBeLessThan(0)
  })

  test('with more neighbours, farther ones count too', async () => {
    const fixture = useFixture()
    const out = await bruno(fixture, tasteWeights(fixture, 4, 5))

    expect(neighbours(out, 'Pequenos Milagres')[0]?.text).toBe(
      '4 pessoas de gosto parecido deram 3,9 em média a este',
    )
  })

  test('a user who shares too few films is no neighbour', async () => {
    const fixture = useFixture()
    // With 2 films shared, user 50 (who gave Pequenos Milagres 1) is the
    // fifth neighbour; with 3 or more, he is out.
    const out = await bruno(fixture, tasteWeights(fixture, 5, 3))

    expect(neighbours(out, 'Pequenos Milagres')[0]?.text).toMatch(/^4 pessoas/)
  })

  test('a Nota from a pairwise answer does not choose the neighbours', async () => {
    const fixture = useFixture()
    // User 50 shares 2 of Bruno's films, one short of the minimum.
    const weights = tasteWeights(fixture, 5, 3)
    const before = await bruno(fixture, weights)
    expect(neighbours(before, 'Pequenos Milagres')[0]?.text).toMatch(
      /^4 pessoas/,
    )
    // Bruno prefers Pequenos Milagres, which every sample user rated, in a
    // pair; the Dono records it as a Nota of 3,5. It would be the third
    // film user 50 shares with him.
    const { session } = await fixture.ok(
      recommendSession({ attendees: ['bruno'], count: 2 }),
      {},
      { owner: 'bruno' },
    )
    const { pairs } = await fixture.ok(
      pairwiseQuestions({ session: session.id, person: 'bruno' }),
    )
    const pair = pairs.find((p) => p.some((f) => f.id === 'tt9000601'))!
    await fixture.ok(
      answerPairwise({
        session: session.id,
        person: 'bruno',
        films: [pair[0].id, pair[1].id],
        choice: 'tt9000601',
      }),
      {},
      { owner: 'bruno' },
    )
    await fixture.ok(
      decidePairwise({ session: session.id, person: 'bruno', record: true }),
      {},
      { owner: 'bruno' },
    )

    const after = await bruno(fixture, weights)
    expect(film(after, 'Pequenos Milagres').predictedRating).toEqual(
      film(before, 'Pequenos Milagres').predictedRating,
    )
    expect(neighbours(after, 'Pequenos Milagres')[0]?.text).toMatch(
      /^4 pessoas/,
    )
  })

  test('fades with the age of her Notas the match rests on, like a Nota seed', async () => {
    const fixture = useFixture()
    const weights = tasteWeights(fixture, 3, 5)
    const now = neighbours(await bruno(fixture, weights), 'Pequenos Milagres')
    const later = neighbours(
      await bruno(fixture, { ...weights, FILMES_HOJE: '2036-11-20' }),
      'Pequenos Milagres',
    )

    expect(later.map((e) => [e.text, e.strength])).toEqual(
      now.map((e) => [e.text, e.strength]),
    )
    expect(later[0]!.contribution).toBeGreaterThan(0)
    expect(later[0]!.contribution).toBeLessThan(now[0]!.contribution)
  })

  test('her recent Notas weigh more than her old ones in choosing them', async () => {
    const fixture = useFixture()
    // User 60 shares 4 of Bruno's films: the three recent ones as he rated
    // them, and Fronteira (401), rated 5 by Bruno in 2019, the other way
    // round. He gave Deserto Branco a 3.
    const choose = (floor: string) =>
      bruno(
        fixture,
        weightsWith(
          fixture,
          'k = 50\nmin_shared = 10',
          'k = 3\nmin_shared = 4',
          [['floor = 0.25', floor]],
        ),
      )
    const evenly = neighbours(await choose('floor = 1.0'), 'Deserto Branco')
    const byAge = neighbours(await choose('floor = 0.25'), 'Deserto Branco')

    // Every Nota counting the same, 401 keeps him out: 10, 20 and 30.
    expect(evenly[0]?.text).toBe(
      '3 pessoas de gosto parecido deram 1,5 em média a este',
    )
    // With the old Nota faded, he takes user 10's place: 20, 30 and 60
    // gave it 1,5, 2 and 3.
    expect(byAge[0]?.text).toBe(
      '3 pessoas de gosto parecido deram 2,2 em média a este',
    )
  })

  test('below the minimum of films shared, there is no neighbour', async () => {
    const fixture = useFixture()
    const out = await bruno(fixture, {})

    expect(neighbours(out, 'Pequenos Milagres')).toEqual([])
    expect(film(out, 'Pequenos Milagres').predictedRating).toBeUndefined()
  })
})

describe('the predicted rating', () => {
  test('is the neighbours’ percentile read back on her scale, from 1 to 10', async () => {
    const fixture = useFixture()
    const out = await bruno(fixture, tasteWeights(fixture, 3, 5))

    // 0,817 lies between the population's 4 (0,77) and 4,5 (0,92): 4,16.
    const predicted = film(out, 'Pequenos Milagres').predictedRating?.['bruno']
    expect(predicted?.value).toBeCloseTo(8.31, 2)
    expect(predicted?.raters).toBe(3)
    // Each neighbour's percentile read on her scale: 8,53, 7,61 and 8,87.
    expect(predicted?.deviation).toBeCloseTo(0.53, 2)
    expect(
      film(out, 'Deserto Branco').predictedRating?.['bruno']?.value,
    ).toBeLessThan(5)
  })

  test('is calibrated on her own Notas once she has enough of them', async () => {
    const fixture = useFixture()
    // Bruno's 11 Notas are his scale: 4,5 is his 0,73 and 5 his 0,91, so
    // the same 0,817 is a 4,75.
    const out = await bruno(fixture, tasteWeights(fixture, 3, 5, 10))

    expect(
      film(out, 'Pequenos Milagres').predictedRating?.['bruno']?.value,
    ).toBeCloseTo(9.49, 2)
  })

  test('is absent for a Presente with no neighbour', async () => {
    const fixture = useFixture()
    const out = await engineRecommendation(
      fixture,
      { attendees: ['bruno', 'teo'], count: 50 },
      tasteWeights(fixture, 3, 5),
    )

    expect(
      Object.keys(film(out, 'Pequenos Milagres').predictedRating ?? {}),
    ).toEqual(['bruno'])
  })
})
