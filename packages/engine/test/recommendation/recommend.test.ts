// `tests/test_recomendar.py`: a recommendation for the Dono (Bruno) alone,
// through the content path "same director".
//
// In the fixture, Bruno gave high Notas to three films by Helena Prado, to
// two by Otávio Lins and by Rui Tavares (those more than 5 years ago), to
// one by Marta Quintal, and low Notas to two by Caio Brandão.

import { describe, expect, test } from 'vite-plus/test'
import {
  recommend,
  type Recommendation,
  type RecommendedFilm,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'
import {
  engineRecommendation,
  film,
  pythonOk,
  titles,
  PYTHON_TIMEOUT,
} from './support.ts'

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

const all = (fixture: Fixture) =>
  engineRecommendation(fixture, { attendees: ['dono'], count: 50 })

const ofKind = (f: RecommendedFilm, kind: string) =>
  (f.evidence['bruno'] ?? []).filter((e) => e.kind === kind)

const metadata = (out: Recommendation, title: string) => {
  const found = ofKind(film(out, title), 'metadata')
  expect(found).toHaveLength(1)
  return found[0]
}

const factIds = (fixture: Fixture, sql: string): string[] =>
  (pythonOk(fixture, ['consultar', sql]) as { linhas: string[][] }).linhas.map(
    ([id]) => id ?? '',
  )

describe('recommend for the Dono alone', { timeout: PYTHON_TIMEOUT }, () => {
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

  test('a seed Nota more than five years old drops one level', async () => {
    const f = film(await all(useFixture()), 'A Volta do Mar')

    expect(
      Object.fromEntries(ofKind(f, 'rating').map((e) => [e.date, e.strength])),
    ).toEqual({ '2019-01-10': 'moderate', '2018-07-07': 'weak' })
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
      factIds(
        fixture,
        "SELECT fato_id FROM notas WHERE filme_id = 'tt9000301'",
      ),
    ).toContain(seed?.factId)
  })

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
    const f = film(await all(useFixture()), 'A Volta do Mar')

    expect(
      Object.fromEntries(
        ofKind(f, 'rating').map((e) => [e.strength, e.contribution]),
      ),
    ).toEqual({ moderate: 0.6, weak: 0.3 })
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
      factIds(
        fixture,
        "SELECT fato_id FROM notas WHERE pessoa = 'bruno' AND filme_id = 'tt9000101'",
      ),
    ).toContain(seen?.factId)
    expect(
      titles(await engineRecommendation(fixture, { attendees: ['dono'] })),
    ).not.toContain('O Farol de Areia')
  })

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
