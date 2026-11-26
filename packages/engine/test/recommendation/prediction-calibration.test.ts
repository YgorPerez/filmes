// The Calibração da Nota prevista [prediction calibration] (#210): the
// taste neighbours' prediction, fitted to what the Pessoa herself gave.
//
// Vera has 9 Notas, 1 to 5, on films of her own (`tt90210NN`, too few
// votes to be Candidates). Users 70, 80 and 90 of the sample rate those 9
// films in the same order and with the same values, but each also gave
// 0,5 to 9 other films: her films sit in the top half of their scale, so
// on her films they are kinder than she is (percentile 0,5 + hers / 2).
// They gave 3 to A Prova (tt9021020), a Candidate where Vera has no Fact.
// With `min_ratings` 9, Vera is read on her own scale.
import { appendFileSync, cpSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import {
  parseYaml,
  personView,
  rebuild,
  recommendSession,
  yamlToJson,
  type Recommendation,
  type Vars,
} from '../../src/index.ts'
import { ROOT, useFixture, type Fixture } from '../fixture.ts'
import {
  engineRecommendation,
  film,
  tasteWeights,
  weightsWith,
} from './support.ts'

const herFilms = Array.from(
  { length: 9 },
  (_, i) => `tt90210${String(i + 1).padStart(2, '0')}`,
)
const theirLowFilms = Array.from(
  { length: 9 },
  (_, i) => `tt90210${String(i + 11).padStart(2, '0')}`,
)
const PROVA = 'tt9021020'
const herRating = (i: number) => (1 + 0.5 * i).toFixed(1)

/** The fixture's Catálogo with Vera and her kinder neighbours, rebuilt. */
const withKinderNeighbours = async (fixture: Fixture): Promise<Vars> => {
  const catalog = join(fixture.root, 'catalogo')
  cpSync(join(ROOT, 'tests/fixture/catalogo'), catalog, { recursive: true })
  const add = (table: string, lines: ReadonlyArray<string>) =>
    appendFileSync(join(catalog, `${table}.csv`), lines.join('\n') + '\n')
  add('filmes', [
    ...[...herFilms, ...theirLowFilms].map(
      (id, i) => `${id},Filme da Vera ${i + 1},2010,100,500,`,
    ),
    `${PROVA},A Prova,2018,105,60000,`,
  ])
  add(
    'notas',
    herFilms.map(
      (id, i) =>
        `vera,${id},${herRating(i)},2025-0${i + 1}-01,Letterboxd da Vera`,
    ),
  )
  add(
    'notas_gosto_movielens',
    [70, 80, 90].flatMap((user) => [
      ...theirLowFilms.map((id) => `${user},${id},0.5`),
      ...herFilms.map((id, i) => `${user},${id},${herRating(i)}`),
      `${user},${PROVA},3.0`,
    ]),
  )
  await fixture.ok(rebuild, { FILMES_CATALOGO: catalog })
  return { FILMES_CATALOGO: catalog }
}

/** Vera's Nota prevista of A Prova, with `pseudoCount` films toward no
 * correction. */
const veraOnProva = async (
  fixture: Fixture,
  catalog: Vars,
  pseudoCount: string,
) => {
  const out = await engineRecommendation(
    fixture,
    { attendees: ['vera'], count: 50 },
    {
      ...catalog,
      ...weightsWith(
        fixture,
        'k = 50\nmin_shared = 10',
        'k = 3\nmin_shared = 5',
        [
          ['min_ratings = 20', 'min_ratings = 9'],
          ['pseudo_count = 20', `pseudo_count = ${pseudoCount}`],
        ],
      ),
    },
  )
  return film(out, 'A Prova')
}

describe('the Pessoa’s prediction error', () => {
  test('averages the calibrated errors on the Já vi scale', async () => {
    const fixture = useFixture()
    const catalog = await withKinderNeighbours(fixture)
    const view = await fixture.ok(
      personView('vera', { predictionError: true }),
      {
        ...catalog,
        ...tasteWeights(fixture, 3, 5, 9),
      },
    )

    expect(view.predictionError?.films).toBe(9)
    // The 9/29 weight on the fit (665/369 × percentile − 611/738)
    // brings the mean absolute error from 2.10234 to 1.45536 points.
    expect(view.predictionError?.meanAbsoluteError).toBeCloseTo(1.45536, 5)
  })

  test('is absent below the minimum number of comparable films', async () => {
    const fixture = useFixture()
    const catalog = await withKinderNeighbours(fixture)
    for (const [minShared, minRatings] of [
      [5, 10],
      [9, 9],
    ] as const) {
      const view = await fixture.ok(
        personView('vera', { predictionError: true }),
        {
          ...catalog,
          ...tasteWeights(fixture, 3, minShared, minRatings),
        },
      )

      expect(view.predictionError).toBeUndefined()
    }
  })
})

describe('the calibrated Nota prevista', () => {
  test('a Pessoa whose neighbours are kinder than her gets a lower one', async () => {
    const fixture = useFixture()
    const catalog = await withKinderNeighbours(fixture)

    const prova = await veraOnProva(fixture, catalog, '20')
    const predicted = prova.predictedRating?.['vera']
    // They put A Prova at their percentile 0,737 (14 of 19 below or half
    // equal), which on Vera's scale is 4,07: 8,13 before the calibration.
    expect(predicted?.raw).toBeCloseTo(8.13, 2)
    // Over her 9 films, leaving each out, her percentile is 1,80 × theirs −
    // 0,83. With 9 films and 20 toward no correction, 9/29 of that fit:
    // percentile 0,663, a 3,74 of hers.
    expect(predicted?.value).toBeCloseTo(7.47, 2)
  })

  test('with no pull toward no correction, the fit is all there is', async () => {
    const fixture = useFixture()
    const catalog = await withKinderNeighbours(fixture)

    const prova = await veraOnProva(fixture, catalog, '0')
    // Her 3,0 is where her fit puts their 0,737: a 6 of 10.
    expect(prova.predictedRating?.['vera']?.value).toBeCloseTo(6, 2)
  })

  test('with few comparable films, it stays nearly the raw one', async () => {
    const fixture = useFixture()
    // Quim has 4 Notas, all rated by users 10, 20, 30 and 40; with
    // `min_shared` 3, each still has neighbours when it is left out. Those
    // neighbours read him the wrong way round, so the bare fit is flat
    // (his mean for every film), but 4 films against 20 keep 1/6 of it.
    const quim = (pseudoCount: string) =>
      engineRecommendation(
        fixture,
        { attendees: ['quim'], count: 50 },
        weightsWith(
          fixture,
          'k = 50\nmin_shared = 10',
          'k = 3\nmin_shared = 3',
          [['pseudo_count = 20', `pseudo_count = ${pseudoCount}`]],
        ),
      )
    const shifts = (out: Recommendation) =>
      out.films.flatMap((f) => {
        const p = f.predictedRating?.['quim']
        return p === undefined ? [] : [Math.abs(p.value - p.raw)]
      })

    const bare = shifts(await quim('0'))
    const shrunk = shifts(await quim('20'))
    expect(bare.length).toBeGreaterThan(5)
    expect(Math.max(...bare)).toBeGreaterThan(1.5)
    expect(Math.max(...shrunk)).toBeLessThan(0.3)
  })
})

describe('the calibrated Nota prevista', () => {
  test('the Evidence of the neighbours and its Força do not change', async () => {
    const fixture = useFixture()
    const catalog = await withKinderNeighbours(fixture)

    const bare = await veraOnProva(fixture, catalog, '0')
    const none = await veraOnProva(fixture, catalog, '1e12')
    expect(none.predictedRating?.['vera']?.value).toBeCloseTo(8.13, 2)
    expect(bare.evidence).toEqual(none.evidence)
    expect(bare.evidence['vera']?.[0]?.text).toBe(
      '3 pessoas de gosto parecido deram 3 em média a este filme',
    )
  })

  test('the Session keeps the calibrated one, not the raw', async () => {
    const fixture = useFixture()
    const catalog = await withKinderNeighbours(fixture)
    const vars = {
      ...catalog,
      ...weightsWith(
        fixture,
        'k = 50\nmin_shared = 10',
        'k = 3\nmin_shared = 5',
        [['min_ratings = 20', 'min_ratings = 9']],
      ),
    }

    const { session } = await fixture.ok(
      recommendSession({ attendees: ['vera'], count: 50 }),
      vars,
      { owner: 'vera' },
    )
    const text = readFileSync(
      join(fixture.data, 'sessions', `${session.id}.md`),
      'utf8',
    )
    const front = yamlToJson(
      parseYaml(text.slice(4, text.indexOf('\n---', 4))),
    ) as { recommendation: Array<Record<string, unknown>> }
    const prova = front.recommendation.find((f) => f['id'] === PROVA)
    expect(prova?.['predicted_rating']).toEqual({
      vera: { value: 7.47, raters: 3, deviation: 0 },
    })
  })
})
