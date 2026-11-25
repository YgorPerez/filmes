// What the golden vectors do not pin: the Evidence a film line and a
// Presente with no Fact get, the shape the result prints, and the names of
// the closed lists, which are the key migration's.
import { data, output, outputToEnglish } from '@filmes/key-migration'
import { expect, test } from 'vite-plus/test'
import {
  evidenceToJson,
  KINDS,
  makeEvidence,
  requestLine,
  RULE_NAMES,
  STRENGTHS,
  withoutFact,
  type Weights,
} from '../../src/index.ts'

const weights: Pick<Weights, 'strength'> = {
  strength: {
    multiplier: { strong: 1, moderate: 0.6, weak: 0.3, guess: 0 },
  },
}

test('a Presente with no Fact gets a weak guess that adds nothing', () => {
  expect(evidenceToJson(withoutFact('bruno', 'tt9000101'), weights)).toEqual({
    person: 'bruno',
    text: 'sem fato',
    source: null,
    date: null,
    strength: 'weak',
    kind: 'guess',
    factId: null,
    contribution: 0,
  })
})

test('a request line is strong metadata about the film, adding nothing', () => {
  const line = requestLine(
    'tt9000101',
    'dura 1h44',
    'IMDb',
    '2026-11-01',
    'filmes:abc',
  )

  expect(line).toMatchObject({
    person: null,
    strength: 'strong',
    kind: 'metadata',
    base: 0,
    seen: false,
    countsAsFact: true,
  })
  expect(evidenceToJson(line, weights).contribution).toBe(0)
})

test('the contribution prints rounded to 4 places', () => {
  const evidence = makeEvidence({
    person: 'bruno',
    filmId: 'tt9000101',
    text: 'deu 4,5 a X',
    source: 'Letterboxd do Bruno',
    date: '2025-06-01',
    strength: 'moderate',
    kind: 'rating',
    factId: 'notas:abc',
    base: 1 / 3,
  })

  expect(evidenceToJson(evidence, weights).contribution).toBe(0.2)
  expect(evidence.seen).toBe(false)
})

test('the printed keys are the output table’s', () => {
  const json = evidenceToJson(withoutFact('bruno', 'tt9000101'), weights)
  const converted = outputToEnglish('recomendar', {
    filmes: [
      {
        evidencias: {
          bruno: [
            {
              pessoa: 'bruno',
              texto: 'sem fato',
              fonte: null,
              data: null,
              forca: 'fraca',
              tipo: 'palpite',
              fato_id: null,
              contribuicao: 0,
            },
          ],
        },
      },
    ],
  }) as { films: [{ evidence: { bruno: [unknown] } }] }

  expect(converted.films[0].evidence.bruno[0]).toEqual(json)
})

test('Força, Tipo and Regra names are the key migration’s', () => {
  expect(new Set(STRENGTHS)).toEqual(
    new Set(
      Object.entries(output.STRENGTHS)
        .filter(([pt]) => pt !== 'palpite')
        .map(([, en]) => en),
    ),
  )
  expect(new Set(KINDS)).toEqual(new Set(Object.values(output.KINDS)))
  expect(new Set(RULE_NAMES)).toEqual(new Set(Object.values(data.RULES)))
})
