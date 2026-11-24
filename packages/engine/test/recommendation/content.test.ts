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
import { pyExp, pyRound, recommend } from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'
import {
  engineRecommendation,
  evidenceOf,
  film,
  pythonOk,
  weightsWith,
  PYTHON_TIMEOUT,
} from './support.ts'

const all = (fixture: Fixture, count = 100, vars = {}) =>
  engineRecommendation(fixture, { attendees: ['dono'], count }, vars)

const sortedRows = <T>(rows: T[]): T[] =>
  [...rows].sort((a, b) => (String(a) < String(b) ? -1 : 1))

describe('the content path', { timeout: PYTHON_TIMEOUT }, () => {
  test('a shared writer links the Nota to the Candidate, at most moderate', async () => {
    // A seed of 5 would be strong; the writer's ceiling is moderate.
    expect(evidenceOf(await all(useFixture()), 'Maré Cheia', 'bruno')).toEqual([
      [
        'deu 5 a O Farol de Areia (2012), também escrito por Ana Ruiz',
        'moderate',
        'rating',
        0.48,
      ],
      [
        'escrito por Ana Ruiz, como 1 filme a que deu 4 ou mais: O Farol de Areia (2012)',
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
          0.3,
        ],
        [
          'com Rita Lobo no elenco, como 1 filme a que deu 4 ou mais: Ponte Aérea (2016)',
          'weak',
          'metadata',
          0.15,
        ],
      ],
    )
  })

  test('an actor outside the first three IMDb credits is weak at most', async () => {
    expect(
      sortedRows(
        evidenceOf(await all(useFixture()), 'Escala em Lisboa', 'bruno'),
      ),
    ).toEqual([
      [
        'com Rita Lobo no elenco, como 1 filme a que deu 4 ou mais: Ponte Aérea (2016)',
        'weak',
        'metadata',
        0.15,
      ],
      [
        'deu 4,5 a Ponte Aérea (2016), também com Rita Lobo',
        'weak',
        'rating',
        0.15,
      ],
    ])
  })

  test('a shared series links the Nota to the Candidate', async () => {
    // The Nota on Fronteira is more than 5 years old: a moderate seed.
    expect(
      evidenceOf(await all(useFixture()), 'Fronteira II', 'bruno'),
    ).toEqual([
      [
        'deu 5 a Fronteira (2008), também da série Trilogia da Fronteira',
        'moderate',
        'rating',
        0.6,
      ],
      [
        'da série Trilogia da Fronteira, como 1 filme a que deu 4 ou mais: Fronteira (2008)',
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

  test('a shared genre is weak at most and makes no seed', async () => {
    expect(evidenceOf(await all(useFixture()), 'Poeira', 'bruno')).toEqual([
      [
        'do gênero faroeste, como 4 filmes a que deu 4 ou mais, entre eles O Farol de Areia (2012), ' +
          'Maré Baixa (2015) e Cidade de Vidro (2018)',
        'weak',
        'metadata',
        0.09,
      ],
    ])
  })

  test('a predicate left out of the weights is no path', async () => {
    const fixture = useFixture()
    const { engine } = weightsWith(fixture, '\nroteiro = 0.8\n', '\n')

    expect(
      evidenceOf(await all(fixture, 100, engine), 'Maré Cheia', 'bruno'),
    ).toEqual([['sem fato', 'weak', 'guess', 0]])
  })

  test('a predicate the path cannot word is invalid config', async () => {
    // Python's message names `[caminho.peso]`; a decision of #90 for the
    // oracle, once a step reaches it (none of the fixture's does).
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
        'com Duda Alves no elenco, como 3 filmes a que deu 4 ou mais: Ensaio Geral (2014), ' +
          'Ato Final (2018) e Bastidores (2016)',
        'moderate',
      ],
      [
        'dirigido por Clara Bastos, como 3 filmes a que deu 4 ou mais: Ensaio Geral (2014), ' +
          'Ato Final (2018) e Bastidores (2016)',
        'strong',
      ],
    ])
  })
})

describe('the Ajuste to a link', { timeout: PYTHON_TIMEOUT }, () => {
  // `pessoa ajustar` is not ported yet: the Python sets the Ajuste up.
  const adjust = (fixture: Fixture, level: string) =>
    pythonOk(fixture, [
      'pessoa',
      'ajustar',
      'bruno',
      '--elo',
      'elenco',
      '--nivel',
      level,
    ])

  test('none removes the link Evidence', async () => {
    const fixture = useFixture()
    adjust(fixture, 'nada')

    expect(evidenceOf(await all(fixture, 60), 'Voo Noturno', 'bruno')).toEqual([
      ['sem fato', 'weak', 'guess', 0],
    ])
  })

  test('low drops the strength and weighs half', async () => {
    const fixture = useFixture()
    adjust(fixture, 'pouco')

    // Without the Ajuste: a moderate seed (0.5 × 0.6) and weak metadata.
    expect(
      sortedRows(evidenceOf(await all(fixture, 60), 'Voo Noturno', 'bruno')),
    ).toEqual([
      [
        'com Rita Lobo no elenco, como 1 filme a que deu 4 ou mais: Ponte Aérea (2016)',
        'weak',
        'metadata',
        0.075,
      ],
      [
        'deu 4,5 a Ponte Aérea (2016), também com Rita Lobo',
        'weak',
        'rating',
        0.075,
      ],
    ])
  })

  test('normal undoes it', async () => {
    const fixture = useFixture()
    adjust(fixture, 'nada')
    adjust(fixture, 'normal')

    expect(
      evidenceOf(await all(fixture, 60), 'Voo Noturno', 'bruno')[0]?.[1],
    ).toBe('moderate')
  })

  test('a new Ajuste to the same link replaces the old; high weighs 1.5 without a stronger strength', async () => {
    const fixture = useFixture()
    adjust(fixture, 'nada')
    adjust(fixture, 'muito')

    expect(
      evidenceOf(await all(fixture, 60), 'Voo Noturno', 'bruno')[0],
    ).toEqual([
      'deu 4,5 a Ponte Aérea (2016), também com Rita Lobo',
      'moderate',
      'rating',
      0.45,
    ])
  })

  test('a Declarado about the actor beats the Ajuste', async () => {
    const fixture = useFixture()
    adjust(fixture, 'nada')
    pythonOk(fixture, [
      'pessoa',
      'declarar',
      'bruno',
      'adoro o Davi Couto',
      '--entidade',
      'Q9001803',
      '--reacao',
      'gosta',
    ])

    const lines = evidenceOf(
      await all(fixture, 60),
      'Risos de Domingo',
      'bruno',
    )
    expect(lines).toHaveLength(1)
    expect(lines[0]?.slice(1, 3)).toEqual(['strong', 'stated'])
  })
})

describe('the cut of the N strongest', { timeout: PYTHON_TIMEOUT }, () => {
  const sigmoid = (sum: number) => pyRound(1 / (1 + pyExp(-sum)), 4)
  const largest = (values: number[]) =>
    values.reduce((best, v) => (Math.abs(v) > Math.abs(best) ? v : best))
  const withCut = (fixture: Fixture) =>
    weightsWith(
      fixture,
      '\nevidencias_maximas = 5\n',
      '\nevidencias_maximas = 1\n',
    ).engine

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
