// The taste analysis on the Pessoa page (#404): the genres, directors,
// actors and decades she rates above her own median, each with the films
// and Notas behind it.
import { describe, expect, test } from 'vite-plus/test'
import { personRate, personView } from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'
import { weightsWith } from '../recommendation/support.ts'

/** Her own Escala from `minRatings` Notas on. */
const scaleFrom = (fixture: Fixture, minRatings: number) =>
  weightsWith(fixture, 'min_ratings = 20', `min_ratings = ${minRatings}`)

const analysisOf = async (
  fixture: Fixture,
  person: string,
  minRatings: number,
) =>
  (
    await fixture.ok(
      personView(person, { tasteAnalysis: true }),
      scaleFrom(fixture, minRatings),
    )
  ).tasteAnalysis

describe('the taste analysis', () => {
  test('names the directors and genres above her median, with the films behind each', async () => {
    const fixture = useFixture()

    const analysis = await analysisOf(fixture, 'bruno', 11)

    // Bruno's 11 Notas: 1, 2, 3,5, 4, 4, 4, 4, 4,5, 4,5, 5, 5. Median 4.
    expect(analysis?.ratings).toBe(11)
    expect(analysis?.median).toBe(4)
    // Helena Prado: 5, 4,5 and 4, 0,3 above the median once two films of
    // her median are added to hers. Rui Tavares: 5 and 4 (0,25). Otávio
    // Lins: 4,5 and 4 (0,125). Marta Quintal (4 and 3,5) and Caio Brandão
    // (1 and 2) fall below.
    expect(analysis?.directors).toEqual([
      {
        key: 'Q9000001',
        label: 'Helena Prado',
        mean: 4.5,
        count: 3,
        films: [
          {
            filmId: 'tt9000101',
            title: 'O Farol de Areia',
            year: 2012,
            rating: 5,
          },
          { filmId: 'tt9000102', title: 'Maré Baixa', year: 2015, rating: 4.5 },
          {
            filmId: 'tt9000103',
            title: 'Cidade de Vidro',
            year: 2018,
            rating: 4,
          },
        ],
      },
      {
        key: 'Q9000004',
        label: 'Rui Tavares',
        mean: 4.5,
        count: 2,
        films: [
          { filmId: 'tt9000401', title: 'Fronteira', year: 2008, rating: 5 },
          {
            filmId: 'tt9000402',
            title: 'Inverno em Lisboa',
            year: 2011,
            rating: 4,
          },
        ],
      },
      {
        key: 'Q9000002',
        label: 'Otávio Lins',
        mean: 4.25,
        count: 2,
        films: [
          {
            filmId: 'tt9000201',
            title: 'Ponte Aérea',
            year: 2016,
            rating: 4.5,
          },
          {
            filmId: 'tt9000202',
            title: 'O Último Bonde',
            year: 2019,
            rating: 4,
          },
        ],
      },
    ])
    // The IMDb genre, in Portuguese. Crime and Romance have one film each:
    // one film says nothing of a genre.
    expect(analysis?.genres.map((g) => [g.label, g.mean, g.count])).toEqual([
      ['Drama', 4.5, 3],
    ])
    // Rita Lobo is in one film of his; the 2010s average 3,83.
    expect(analysis?.actors).toEqual([])
    expect(analysis?.decades).toEqual([])
  })

  test('names the decades she rates above her median', async () => {
    const fixture = useFixture()

    const analysis = await analysisOf(fixture, 'quim', 4)

    // Quim: 5, 4,5 and 3,5 in the 2010s, 2 in 2008. Median 4.
    expect(analysis?.decades).toEqual([
      {
        key: '2010',
        label: '2010',
        mean: 13 / 3,
        count: 3,
        films: [
          { filmId: 'tt9000201', title: 'Ponte Aérea', year: 2016, rating: 5 },
          { filmId: 'tt9000501', title: 'Barulho', year: 2013, rating: 4.5 },
          { filmId: 'tt9000102', title: 'Maré Baixa', year: 2015, rating: 3.5 },
        ],
      },
    ])
  })

  test('an actor counts in her first three credits, or in a film without credits', async () => {
    const fixture = useFixture()
    // Rita Lobo is the second credit of Voo Noturno and outside the first
    // three of Escala em Lisboa; Ponte Aérea has no credits loaded.
    await fixture.ok(
      personRate({
        person: 'bruno',
        ratings: [
          { film: 'tt9001902', rating: 10 },
          { film: 'tt9003501', rating: 10 },
        ],
      }),
    )

    const analysis = await analysisOf(fixture, 'bruno', 13)

    expect(analysis?.actors).toEqual([
      {
        key: 'Q9001902',
        label: 'Rita Lobo',
        mean: 4.75,
        count: 2,
        films: [
          { filmId: 'tt9001902', title: 'Voo Noturno', year: 2021, rating: 5 },
          {
            filmId: 'tt9000201',
            title: 'Ponte Aérea',
            year: 2016,
            rating: 4.5,
          },
        ],
      },
    ])
  })

  test('is absent below the Notas of her own Escala, and unless asked', async () => {
    const fixture = useFixture()

    // Bruno has 11 Notas, below the 20 of `[rating_percentile]`.
    const view = await fixture.ok(personView('bruno', { tasteAnalysis: true }))
    const unasked = await fixture.ok(
      personView('bruno'),
      scaleFrom(fixture, 11),
    )

    expect(view.tasteAnalysis).toBeUndefined()
    expect(unasked.tasteAnalysis).toBeUndefined()
  })
})
