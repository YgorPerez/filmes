// What the golden vectors do not pin: the Evidence a film line and a
// Presente with no Fact get, the shape the result prints, and the names of
// the closed lists, which are Python's in English.
import * as names from '../python-names.ts'
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
  expect(
    evidenceToJson(withoutFact('bruno', 'tt9000101'), weights),
  ).toStrictEqual({
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

test('Força, Tipo and Regra names are Python’s, in English', () => {
  expect(new Set(STRENGTHS)).toEqual(
    new Set(
      Object.entries(names.STRENGTHS)
        .filter(([pt]) => pt !== 'palpite')
        .map(([, en]) => en),
    ),
  )
  expect(new Set(KINDS)).toEqual(new Set(Object.values(names.KINDS)))
  expect(new Set(RULE_NAMES)).toEqual(new Set(Object.values(names.RULES)))
})
