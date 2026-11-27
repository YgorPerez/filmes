// `tests/test_caminho_conteudo.py` and `tests/test_ajuste_e_corte.py`: the
// content path by writer, cast, series and genre besides the director, a
// Pessoa's Ajuste to a link, and the cut of the N strongest.
//
// In the fixture (see its LEIAME), each film from 1901 to 1904 links to
// Bruno's Notas by one predicate only: Maré Cheia by its writer, Voo Noturno
// by Rita Lobo in the cast, Fronteira II by its series, Poeira by its genre;
// Escala em Lisboa also has Rita Lobo, outside the first 3 IMDb credits; Mar
// Aberto is on the same list as Fronteira, which Wikidata puts in P179 but
// is no series. The weights are writer 0.8, cast 0.5, series 1.0, genre 0.3.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import {
  filmReason,
  importImdb,
  personAdjust,
  personState,
  pyExp,
  pyRound,
  recommend,
  type Level,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'
import {
  engineRecommendation,
  evidenceOf,
  film,
  weightsWith,
} from './support.ts'

const AUTHOR = { name: 'Dono', email: 'dono@example.org' }

const all = (fixture: Fixture, count = 100, vars = {}) =>
  engineRecommendation(fixture, { attendees: ['dono'], count }, vars)

const sortedRows = <T>(rows: T[]): T[] =>
  [...rows].sort((a, b) => (String(a) < String(b) ? -1 : 1))

describe('the content path', () => {
  test('a shared writer links the Nota to the Candidate, at most moderate', async () => {
    // A seed of 5 would be strong; the writer's ceiling is moderate.
    expect(evidenceOf(await all(useFixture()), 'Maré Cheia', 'bruno')).toEqual([
      [
        'deu 5 a O Farol de Areia (2012), também escrito por Ana Ruiz',
        'moderate',
        'rating',
        // 0.8 × 0.6, ×0.8156 for the 5 of 2025-06-01 (a half-life of 5 years).
        0.3915,
      ],
      [
        'escrito por Ana Ruiz, como 1 filme a que deu nota alta: O Farol de Areia (2012)',
        'weak',
        'metadata',
        0.24,
      ],
    ])
  })

  test('a shared actor links the Nota to the Candidate, at most moderate', async () => {
    expect(evidenceOf(await all(useFixture()), 'Voo Noturno', 'bruno')).toEqual(
      [
        [
          'deu 4,5 a Ponte Aérea (2016), também com Rita Lobo',
          'moderate',
          'rating',
          // 0.5 × 0.6, ×0.7528 for the 4.5 of 2024-11-02.
          0.2259,
        ],
        [
          'com Rita Lobo no elenco, como 1 filme a que deu nota alta: Ponte Aérea (2016)',
          'weak',
          'metadata',
          0.15,
        ],
      ],
    )
  })
})

describe('the content path', () => {
  test('an actor outside the first three IMDb credits is weak at most', async () => {
    expect(
      sortedRows(
        evidenceOf(await all(useFixture()), 'Escala em Lisboa', 'bruno'),
      ),
    ).toEqual([
      [
        'com Rita Lobo no elenco, como 1 filme a que deu nota alta: Ponte Aérea (2016)',
        'weak',
        'metadata',
        0.15,
      ],
      [
        'deu 4,5 a Ponte Aérea (2016), também com Rita Lobo',
        'weak',
        'rating',
        0.1129,
      ],
    ])
  })

  test('a shared series links the Nota to the Candidate', async () => {
    // The Nota on Fronteira is from 2019: still a strong seed, but it keeps
    // only ×0.3363 of its weight (a half-life of 5 years).
    expect(
      evidenceOf(await all(useFixture()), 'Fronteira II', 'bruno'),
    ).toEqual([
      [
        'deu 5 a Fronteira (2008), também da série Trilogia da Fronteira',
        'strong',
        'rating',
        0.3363,
      ],
      [
        'da série Trilogia da Fronteira, como 1 filme a que deu nota alta: Fronteira (2008)',
        'weak',
        'metadata',
        0.3,
      ],
    ])
  })

  test('a list in P179 is no series', async () => {
    const texts = evidenceOf(
      await all(useFixture()),
      'Mar Aberto',
      'bruno',
    ).map(([text]) => text)
    expect(texts.filter((t) => t.includes('série'))).toEqual([])
  })
})

describe('the content path', () => {
  test('a shared genre is weak at most and makes no seed', async () => {
    expect(evidenceOf(await all(useFixture()), 'Poeira', 'bruno')).toEqual([
      [
        'do gênero faroeste, como 4 filmes a que deu nota alta, entre eles O Farol de Areia (2012), ' +
          'Maré Baixa (2015) e Cidade de Vidro (2018)',
        'weak',
        'metadata',
        0.09,
      ],
    ])
  })

  test('a predicate left out of the weights is no path', async () => {
    const fixture = useFixture()
    const engine = weightsWith(fixture, '\nwriter = 0.8\n', '\n')

    expect(
      evidenceOf(await all(fixture, 100, engine), 'Maré Cheia', 'bruno'),
    ).toEqual([['sem fato', 'weak', 'guess', 0]])
  })

  test('a predicate the path cannot word is invalid config', async () => {
    // Python's message named `[caminho.peso]` (a decision of #90).
    const fixture = useFixture()
    const weights = join(fixture.root, 'weights-test.toml')
    const text = readFileSync(join(fixture.config, 'weights.toml'), 'utf8')
    writeFileSync(
      weights,
      text.replace('\nwriter = 0.8\n', '\nwriter = 0.8\npais = 0.1\n'),
    )

    const outcome = await fixture.run(recommend({ attendees: ['dono'] }), {
      FILMES_PESOS: weights,
    })
    expect(outcome.output).toEqual({
      error: {
        code: 'invalid_config',
        message:
          '[path.weight] pais: o caminho de conteúdo não sabe redigir esse predicado',
      },
    })
  })
})

describe('the content path', () => {
  test('a principal actor on three high Notas is moderate at most, and the director strong', async () => {
    // Rosa gave 5, 4.5 and 4.5 to Ensaio Geral, Bastidores and Ato Final, all
    // by Clara Bastos and with Duda Alves. Coxia too, with Duda Alves first
    // in the IMDb credits: the cast's ceiling is moderate, the director's not.
    const out = await engineRecommendation(useFixture(), {
      attendees: ['rosa'],
    })
    const metadata = (film(out, 'Coxia').evidence['rosa'] ?? [])
      .filter((e) => e.kind === 'metadata')
      .map((e) => [e.text, e.strength])
    expect(sortedRows(metadata)).toEqual([
      [
        'com Duda Alves no elenco, como 3 filmes a que deu nota alta: Ensaio Geral (2014), ' +
          'Ato Final (2018) e Bastidores (2016)',
        'moderate',
      ],
      [
        'dirigido por Clara Bastos, como 3 filmes a que deu nota alta: Ensaio Geral (2014), ' +
          'Ato Final (2018) e Bastidores (2016)',
        'strong',
      ],
    ])
  })

  test('seeds with the same title come out in year order', async () => {
    // Rosa gave 4 to both of Nina Vale's Reprise, the 2011 one (tt9012601)
    // and the 2004 one (tt9012602). Same Nota, same title: the year breaks
    // the tie, then the id.
    const out = await engineRecommendation(useFixture(), {
      attendees: ['rosa'],
    })
    expect(
      (film(out, 'Bis').evidence['rosa'] ?? []).map((e) => e.text),
    ).toEqual([
      'dirigido por Nina Vale, como 2 filmes a que deu nota alta: Reprise (2004) e Reprise (2011)',
      'deu 4 a Reprise (2004), também de Nina Vale',
      'deu 4 a Reprise (2011), também de Nina Vale',
    ])
  })
})

describe('the Ajuste to a link', () => {
  const adjust = (fixture: Fixture, level: Level) =>
    fixture.ok(personAdjust({ person: 'bruno', link: 'cast', level }))

  test('none removes the link Evidence', async () => {
    const fixture = useFixture()
    await adjust(fixture, 'none')

    expect(evidenceOf(await all(fixture, 60), 'Voo Noturno', 'bruno')).toEqual([
      ['sem fato', 'weak', 'guess', 0],
    ])
  })

  test('low drops the strength and weighs half', async () => {
    const fixture = useFixture()
    await adjust(fixture, 'low')

    // Without the Ajuste: a moderate seed (0.5 × 0.6, ×0.7528 for its age)
    // and weak metadata.
    expect(
      sortedRows(evidenceOf(await all(fixture, 60), 'Voo Noturno', 'bruno')),
    ).toEqual([
      [
        'com Rita Lobo no elenco, como 1 filme a que deu nota alta: Ponte Aérea (2016)',
        'weak',
        'metadata',
        0.075,
      ],
      [
        'deu 4,5 a Ponte Aérea (2016), também com Rita Lobo',
        'weak',
        'rating',
        0.0565,
      ],
    ])
  })

  test('normal undoes it', async () => {
    const fixture = useFixture()
    await adjust(fixture, 'none')
    await adjust(fixture, 'normal')

    expect(
      evidenceOf(await all(fixture, 60), 'Voo Noturno', 'bruno')[0]?.[1],
    ).toBe('moderate')
  })
})

describe('the Ajuste to a link', () => {
  const adjust = (fixture: Fixture, level: Level) =>
    fixture.ok(personAdjust({ person: 'bruno', link: 'cast', level }))

  test('a new Ajuste to the same link replaces the old; high weighs 1.5 without a stronger strength', async () => {
    const fixture = useFixture()
    await adjust(fixture, 'none')
    await adjust(fixture, 'high')

    expect(
      evidenceOf(await all(fixture, 60), 'Voo Noturno', 'bruno')[0],
    ).toEqual([
      'deu 4,5 a Ponte Aérea (2016), também com Rita Lobo',
      'moderate',
      'rating',
      // 0.5 × 1.5 × 0.6, ×0.7528 for its age.
      0.3388,
    ])
  })

  test('a Declarado about the actor beats the Ajuste', async () => {
    const fixture = useFixture()
    await adjust(fixture, 'none')
    await fixture.ok(
      personState({
        person: 'bruno',
        text: 'adoro o Davi Couto',
        target: 'Q9001803',
        reaction: 'like',
      }),
    )

    const lines = evidenceOf(
      await all(fixture, 60),
      'Risos de Domingo',
      'bruno',
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]?.slice(1, 3)).toEqual(['strong', 'stated'])
  })
})

describe('the cut of the N strongest', () => {
  const sigmoid = (sum: number) => pyRound(1 / (1 + pyExp(-sum)), 4)
  const largest = (values: number[]) =>
    values.reduce((best, v) => (Math.abs(v) > Math.abs(best) ? v : best))
  const withCut = (fixture: Fixture) =>
    weightsWith(fixture, '\nmax_evidence = 5\n', '\nmax_evidence = 1\n')

  test('only the N strongest add to the utility', async () => {
    const fixture = useFixture()
    const f = film(await all(fixture, 60, withCut(fixture)), 'As Horas Lentas')
    const contributions = (f.evidence['bruno'] ?? []).map((e) => e.contribution)
    expect(contributions.length).toBeGreaterThan(1)

    expect(f.utility['bruno']).toBe(sigmoid(largest(contributions)))
  })

  test('a Já visto is outside the cut and always counts', async () => {
    const fixture = useFixture()
    const f = film(await all(fixture, 60, withCut(fixture)), 'O Farol de Areia')
    const evidence = f.evidence['bruno'] ?? []
    const seen = evidence
      .filter((e) => e.text === 'já viu')
      .map((e) => e.contribution)
    const others = evidence
      .filter((e) => e.text !== 'já viu')
      .map((e) => e.contribution)
    expect(seen).toHaveLength(1)
    expect(others.length).toBeGreaterThan(0)

    expect(f.utility['bruno']).toBe(sigmoid((seen[0] ?? 0) + largest(others)))
  })
})

describe('the content path by cinematography and producer', () => {
  // The Dono's decision on #283: both join the path at most weak, with
  // weight 0.5. In the fixture, Luz Rasante shares its cinematographer and
  // Bilheteria its producer with Contraluz, which nobody rated: Vera gives it
  // 10 here (a 5, a strong seed). All three have 900 votes: only Candidates
  // with a lower minimum.
  const SEED =
    'Const,Your Rating,Date Rated,Title,Original Title,URL,Title Type,IMDb Rating,Runtime (mins),Year,Genres,Num Votes,Release Date,Directors\n' +
    'tt9028403,10,2025-03-01,Contraluz,Contraluz,https://www.imdb.com/title/tt9028403/,Movie,7.2,101,2013,Drama,900,2013-04-05,\n'
  const vera = async (fixture: Fixture) => {
    await fixture.ok(
      importImdb({
        person: 'vera',
        original: 'ratings.csv',
        content: new TextEncoder().encode(SEED),
        author: AUTHOR,
      }),
    )
    return engineRecommendation(
      fixture,
      { attendees: ['vera'], count: 100 },
      weightsWith(fixture, 'min_votes = 1000', 'min_votes = 900'),
    )
  }

  test('a shared cinematographer links the Nota to the Candidate, at most weak', async () => {
    const out = await vera(useFixture())
    expect(sortedRows(evidenceOf(out, 'Luz Rasante', 'vera'))).toEqual([
      [
        'com fotografia de Íris Penha, como 1 filme a que deu nota alta: Contraluz (2013)',
        'weak',
        'metadata',
        // 0.5 × 0.3.
        0.15,
      ],
      [
        'deu 5 a Contraluz (2013), também com fotografia de Íris Penha',
        'weak',
        'rating',
        // 0.5 × 0.3, ×0.787 for the 5 of 2025-03-01.
        0.1181,
      ],
    ])
    expect(filmReason(film(out, 'Luz Rasante').evidence)).toEqual({
      kind: 'entity',
      name: 'Íris Penha',
      people: ['vera'],
    })
  })

  test('a shared producer links the Nota to the Candidate, at most weak', async () => {
    const out = await vera(useFixture())
    expect(sortedRows(evidenceOf(out, 'Bilheteria', 'vera'))).toEqual([
      [
        'deu 5 a Contraluz (2013), também produzido por Nestor Gil',
        'weak',
        'rating',
        0.1181,
      ],
      [
        'produzido por Nestor Gil, como 1 filme a que deu nota alta: Contraluz (2013)',
        'weak',
        'metadata',
        0.15,
      ],
    ])
    expect(filmReason(film(out, 'Bilheteria').evidence)).toEqual({
      kind: 'entity',
      name: 'Nestor Gil',
      people: ['vera'],
    })
  })

  test('the Ajuste to each link reaches it', async () => {
    const fixture = useFixture()
    await fixture.ok(
      personAdjust({ person: 'vera', link: 'cinematography', level: 'none' }),
    )
    await fixture.ok(
      personAdjust({ person: 'vera', link: 'producer', level: 'high' }),
    )
    const out = await vera(fixture)

    expect(evidenceOf(out, 'Luz Rasante', 'vera')).toEqual([
      ['sem fato', 'weak', 'guess', 0],
    ])
    // 1.5 × the weight, and still weak.
    expect(sortedRows(evidenceOf(out, 'Bilheteria', 'vera'))).toEqual([
      [
        'deu 5 a Contraluz (2013), também produzido por Nestor Gil',
        'weak',
        'rating',
        0.1772,
      ],
      [
        'produzido por Nestor Gil, como 1 filme a que deu nota alta: Contraluz (2013)',
        'weak',
        'metadata',
        0.225,
      ],
    ])
  })
})
