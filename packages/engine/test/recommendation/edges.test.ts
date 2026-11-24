// Pieces of the pipeline with cases the fixture does not reach: the first
// sentence of a synopsis and the order of Sessions on the same day.

import { expect, test } from 'vite-plus/test'
import { compareTuple, firstSentence, sessionOrder } from '../../src/index.ts'

test.each([
  [null, null],
  ['', null],
  ['Sem ponto final', 'Sem ponto final'],
  ['Uma frase. Outra.', 'Uma frase.'],
  ['O Sr. Lemos chega. Depois sai.', 'O Sr. Lemos chega.'],
  ['Ele disse "chega!" e saiu.', 'Ele disse "chega!"'],
  ['Fim… e mais', 'Fim…'],
  ['Versão 2.0 saiu. Ok', 'Versão 2.0 saiu.'],
  ['. começa com ponto', '.'],
  ['Dr.\u{2003}Lemos chega.', 'Dr.\u{2003}Lemos chega.'],
  ['Termina na quebra.\n', 'Termina na quebra.'],
])('the first sentence of %j is %j', (text, sentence) => {
  expect(firstSentence(text)).toBe(sentence)
})

test('a second Session on a day comes after the first, by number', () => {
  const ids = [
    '2026-11-20-bruno-10',
    '2026-11-20-bruno',
    '2026-11-20-bruno-9',
    '2026-11-19-iara',
    '2026-11-20-bruno-2',
    'x-3',
  ]
  const sorted = ids
    .map((id) => ({ id, key: sessionOrder({ id, date: id.slice(0, 10) }) }))
    .sort((a, b) => compareTuple([...a.key], [...b.key]))
    .map(({ id }) => id)

  expect(sorted).toEqual([
    '2026-11-19-iara',
    '2026-11-20-bruno',
    '2026-11-20-bruno-2',
    '2026-11-20-bruno-9',
    '2026-11-20-bruno-10',
    'x-3',
  ])
  expect(sessionOrder({ id: 'x-3', date: 'x-3' })).toEqual(['x-3', 'x-3', 1n])
})
