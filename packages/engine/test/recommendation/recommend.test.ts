// `tests/test_recomendar.py`: a recommendation for the Dono (Bruno) alone,
// through the content path "same director".
//
// In the fixture, Bruno gave high Notas to three films by Helena Prado, to
// two by Otávio Lins and by Rui Tavares (those 8 years ago), to
// one by Marta Quintal, and low Notas to two by Caio Brandão.

import { describe, expect, test } from 'vite-plus/test'
import {
  consult,
  recommend,
  type Recommendation,
  type RecommendedFilm,
  type Vars,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'
import { engineRecommendation, film, titles, weightsWith } from './support.ts'

const EVIDENCE_FIELDS = [
  'contribution',
  'date',
  'factId',
  'kind',
  'person',
  'source',
  'strength',
  'text',
]

const all = (fixture: Fixture, vars: Vars = {}) =>
  engineRecommendation(fixture, { attendees: ['dono'], count: 50 }, vars)

const ofKind = (f: RecommendedFilm, kind: string) =>
  (f.evidence['bruno'] ?? []).filter((e) => e.kind === kind)

const metadata = (out: Recommendation, title: string) => {
  const found = ofKind(film(out, title), 'metadata')
  expect(found).toHaveLength(1)
  return found[0]
}

const factIds = async (fixture: Fixture, sql: string): Promise<string[]> =>
  (await fixture.ok(consult(sql))).rows.map(([id]) => String(id ?? ''))

describe('recommend for the Dono alone', () => {
  test('the Dono alone gets five films with Evidence', async () => {
    const fixture = useFixture()
    const out = await engineRecommendation(fixture, { attendees: ['dono'] })

    expect(out.attendees).toEqual(['bruno'])
    expect(out.films).toHaveLength(5)
    for (const f of out.films) {
      expect(Object.keys(f.evidence)).toEqual(['bruno'])
      expect(f.evidence['bruno']?.length).toBeGreaterThan(0)
      for (const e of f.evidence['bruno'] ?? []) {
        expect(Object.keys(e).sort()).toEqual(EVIDENCE_FIELDS)
        expect(e.person).toBe('bruno')
        expect(['strong', 'moderate', 'weak']).toContain(e.strength)
      }
    }
  })

  test('three high Notas on the same director give strong Evidence', async () => {
    const e = metadata(await all(useFixture()), 'As Horas Lentas')

    expect(e?.strength).toBe('strong')
    expect(e?.text).toContain('Helena Prado')
    expect(e?.source).toBe('Wikidata')
    expect(e?.factId).toBeTruthy()
  })

  test('two high Notas give moderate, one gives weak', async () => {
    const out = await all(useFixture())

    expect(metadata(out, 'Noite de Estreia')?.strength).toBe('moderate')
    expect(metadata(out, 'Vento Norte')?.strength).toBe('weak')
  })

  test('a recent seed Nota follows its value', async () => {
    const f = film(await all(useFixture()), 'As Horas Lentas')

    expect(
      Object.fromEntries(ofKind(f, 'rating').map((e) => [e.text, e.strength])),
    ).toEqual({
      'deu 5 a O Farol de Areia (2012), também de Helena Prado': 'strong',
      'deu 4,5 a Maré Baixa (2015), também de Helena Prado': 'strong',
      'deu 4 a Cidade de Vidro (2018), também de Helena Prado': 'moderate',
    })
  })

  test('a seed Nota keeps its Força however old it is', async () => {
    const f = film(await all(useFixture()), 'A Volta do Mar')

    expect(
      Object.fromEntries(ofKind(f, 'rating').map((e) => [e.date, e.strength])),
    ).toEqual({ '2019-01-10': 'strong', '2018-07-07': 'moderate' })
  })
})

describe('recommend for the Dono alone', () => {
  test("a seed Nota's contribution halves with every half-life of age", async () => {
    // A half-life of 5 years: the 5 of 2019 is 2,871 days old (×0.3363),
    // the 4 of 2018 is 3,058 days old (×0.3133 of the moderate 0.6).
    const f = film(await all(useFixture()), 'A Volta do Mar')

    expect(
      Object.fromEntries(
        ofKind(f, 'rating').map((e) => [e.date, e.contribution]),
      ),
    ).toEqual({ '2019-01-10': 0.3363, '2018-07-07': 0.188 })
  })

  test('an old Nota never weighs less than the floor', async () => {
    const fixture = useFixture()
    const f = film(
      await all(
        fixture,
        weightsWith(fixture, 'half_life_years = 5.0', 'half_life_years = 1.0'),
      ),
      'A Volta do Mar',
    )

    // Over 7 half-lives old, both stop at the floor of 0.25.
    expect(
      Object.fromEntries(
        ofKind(f, 'rating').map((e) => [e.date, e.contribution]),
      ),
    ).toEqual({ '2019-01-10': 0.25, '2018-07-07': 0.15 })
  })

  test('a seed Nota has its source, date and Fact', async () => {
    const fixture = useFixture()
    const f = film(await all(fixture), 'Vento Norte')

    const [seed] = ofKind(f, 'rating').filter((e) =>
      e.text.includes('Jardim Suspenso'),
    )
    expect(seed?.source).toBe('Letterboxd do Bruno')
    expect(seed?.date).toBe('2024-05-05')
    expect(
      await factIds(
        fixture,
        "SELECT fato_id FROM notas WHERE filme_id = 'tt9000301'",
      ),
    ).toContain(seed?.factId)
  })
})

describe('recommend for the Dono alone', () => {
  test('low Notas on the director weigh against', async () => {
    const out = await all(useFixture())
    const f = film(out, 'Explosão Final')

    const against = ofKind(f, 'rating')
    expect(new Set(against.map((e) => e.strength))).toEqual(
      new Set(['strong', 'moderate']),
    )
    expect(against.every((e) => e.contribution < 0)).toBe(true)
    expect(f.utility['bruno']).toBeLessThan(0.5)
    // After it, only Barulho and Asfalto Quente, which Bruno gave 1 and 2
    // (seen and a seed against each other), and the films with no Fact.
    const withFact = out.films.filter((x) => !x.onlyGuesses).map((x) => x.title)
    expect(
      new Set(withFact.slice(withFact.indexOf('Explosão Final') + 1)),
    ).toEqual(new Set(['Barulho', 'Asfalto Quente']))
  })

  test('the strength multiplies the contribution', async () => {
    // A floor of 1 leaves every Nota undecayed.
    const fixture = useFixture()
    const f = film(
      await all(fixture, weightsWith(fixture, 'floor = 0.25', 'floor = 1.0')),
      'A Volta do Mar',
    )

    expect(
      Object.fromEntries(
        ofKind(f, 'rating').map((e) => [e.strength, e.contribution]),
      ),
    ).toEqual({ strong: 1.0, moderate: 0.6 })
  })

  test('the film with stronger Evidence comes first', async () => {
    const order = titles(await all(useFixture()))
    const at = (title: string) => order.indexOf(title)

    expect(at('As Horas Lentas')).toBeLessThan(at('Noite de Estreia'))
    expect(at('Noite de Estreia')).toBeLessThan(at('A Volta do Mar'))
    expect(at('A Volta do Mar')).toBeLessThan(at('Vento Norte'))
    expect(at('Vento Norte')).toBeLessThan(at('Explosão Final'))
  })

  test('a film with fewer votes than the minimum is no Candidate', async () => {
    const out = titles(await all(useFixture()))

    expect(out).not.toContain('Curta da Madrugada') // 600 votes, by Helena Prado
    expect(out).toContain('As Horas Lentas')
  })
})

describe('recommend for the Dono alone', () => {
  test('an unknown Presente is an error', async () => {
    const outcome = await useFixture().run(recommend({ attendees: ['fulano'] }))

    expect(outcome.exitCode).toBe(1)
    expect(outcome.output).toEqual({
      error: {
        code: 'unknown_person',
        message: "nenhuma Pessoa se chama 'fulano'",
      },
    })
  })

  test('the Dono can be called by name or nickname', async () => {
    const fixture = useFixture()
    const byName = await engineRecommendation(fixture, { attendees: ['Bruno'] })
    const byNickname = await engineRecommendation(fixture, {
      attendees: ['eu'],
    })

    expect(byName.attendees).toEqual(['bruno'])
    expect(byNickname.attendees).toEqual(['bruno'])
  })

  test('a film the Pessoa rated is seen and weighs against', async () => {
    const fixture = useFixture()
    const out = await all(fixture)

    const [seen] = (
      film(out, 'O Farol de Areia').evidence['bruno'] ?? []
    ).filter((e) => e.text === 'já viu')
    expect(seen).toEqual({
      person: 'bruno',
      text: 'já viu',
      source: 'Letterboxd do Bruno',
      date: '2025-06-01',
      strength: 'strong',
      kind: 'rating',
      factId: seen?.factId,
      contribution: -1.0,
    })
    expect(
      await factIds(
        fixture,
        "SELECT fato_id FROM notas WHERE pessoa = 'bruno' AND filme_id = 'tt9000101'",
      ),
    ).toContain(seen?.factId)
    expect(
      titles(await engineRecommendation(fixture, { attendees: ['dono'] })),
    ).not.toContain('O Farol de Areia')
  })
})

describe('recommend for the Dono alone', () => {
  test('a film rated below 7 on the IMDb is never a Candidate', async () => {
    // Sombra Morna is by Helena Prado, Bruno's favourite, but has 6.5.
    const out = titles(await all(useFixture()))

    expect(out).not.toContain('Sombra Morna')
    expect(out).toContain('As Horas Lentas') // 7.4 passes
  })

  test('a size below 1 is invalid usage', async () => {
    const outcome = await useFixture().run(
      recommend({ attendees: ['dono'], count: 0 }),
    )

    expect(outcome).toEqual({
      exitCode: 2,
      output: {
        error: {
          code: 'invalid_usage',
          message: '--quantos precisa ser 1 ou mais',
        },
      },
    })
  })
})

describe('the ruler reads a Nota by its percentile (#172)', () => {
  // Bruno has 11 Notas: 5 twice, 4,5 twice, 4 four times, 3,5, 2 and 1.
  // Below the minimum of 20 they are read on the fixture's MovieLens
  // population (`notas_movielens.csv`), which gives what the old absolute
  // ruler gave. With a minimum of 10, on his own Notas: 5 is his top 10%
  // (strong), 4,5 moderate, and 4, near his median, only weak.
  const own = (fixture: Fixture) =>
    weightsWith(fixture, 'min_ratings = 20', 'min_ratings = 10')

  test('from the minimum on, a seed Nota is read on his own Notas', async () => {
    const fixture = useFixture()
    const f = film(await all(fixture, own(fixture)), 'As Horas Lentas')

    expect(
      Object.fromEntries(ofKind(f, 'rating').map((e) => [e.text, e.strength])),
    ).toEqual({
      'deu 5 a O Farol de Areia (2012), também de Helena Prado': 'strong',
      'deu 4,5 a Maré Baixa (2015), também de Helena Prado': 'moderate',
      'deu 4 a Cidade de Vidro (2018), também de Helena Prado': 'weak',
    })
  })

  test('the aggregated metadata counts only his high Notas', async () => {
    const fixture = useFixture()
    const e = metadata(await all(fixture, own(fixture)), 'As Horas Lentas')

    expect([e?.text, e?.strength]).toEqual([
      'dirigido por Helena Prado, como 2 filmes a que deu nota alta: O Farol de Areia (2012) e Maré Baixa (2015)',
      'moderate',
    ])
  })

  test('a Nota below his median speaks against the film', async () => {
    const fixture = useFixture()
    const vars = own(fixture)
    const ratings = async (extra: Vars) =>
      Object.fromEntries(
        ofKind(film(await all(fixture, extra), 'Vento Norte'), 'rating').map(
          (e) => [e.text, [e.strength, Math.sign(e.contribution)]],
        ),
      )

    // On the population, his 3,5 is a weak Nota in favour; on his own
    // Notas it sits at 23%, below his median: weak against.
    expect(await ratings({})).toEqual({
      'deu 4 a Jardim Suspenso (2017), também de Marta Quintal': [
        'moderate',
        1,
      ],
      'deu 3,5 a Rio Abaixo (2014), também de Marta Quintal': ['weak', 1],
    })
    expect(await ratings(vars)).toEqual({
      'deu 4 a Jardim Suspenso (2017), também de Marta Quintal': ['weak', 1],
      'deu 3,5 a Rio Abaixo (2014), também de Marta Quintal': ['weak', -1],
    })
  })
})
