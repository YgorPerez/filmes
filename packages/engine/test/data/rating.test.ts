// The Nota scales (`filmes/dados/nota.py`): 0,5 to 5, or 1 to 10 with
// "/10", worth half. tests/test_pessoa_visto.py and test_feedback.py check
// them through `pessoa visto` and `feedback`; these go straight to the
// parser.
import { describe, expect, test } from 'vite-plus/test'
import { formatRating, readRating } from '../../src/index.ts'
import { useFixture } from '../fixture.ts'

describe('a Nota as the Dono writes it', () => {
  test.each([
    ['4', 4, null],
    [' 4,5 ', 4.5, null],
    ['4.5', 4.5, null],
    ['0,5', 0.5, null],
    ['8/10', 4, '8/10'],
    ['9,5 / 10', 4.75, '9,5/10'],
    ['10/10', 5, '10/10'],
  ])('%j', async (text, rating, tenScale) => {
    const fixture = useFixture()

    expect(await fixture.ok(readRating(text))).toEqual({ rating, tenScale })
  })

  test.each([
    [
      '8',
      'nota fora da escala de 0,5 a 5: \'8\' (se é de 1 a 10, escreva "8/10")',
    ],
    ['0,2', "nota fora da escala de 0,5 a 5: '0,2'"],
    ['11/10', "nota de 1 a 10 fora da escala: '11/10'"],
    ['nan/10', "nota de 1 a 10 fora da escala: 'nan/10'"],
    ['4/5', 'nota inválida: \'4/5\' (use de 0,5 a 5, ou de 1 a 10 com "/10")'],
    ['boa', 'nota inválida: \'boa\' (use de 0,5 a 5, ou de 1 a 10 com "/10")'],
    ["4'", 'nota inválida: "4\'" (use de 0,5 a 5, ou de 1 a 10 com "/10")'],
  ])('%j is invalid_usage', async (text, message) => {
    const fixture = useFixture()

    const outcome = await fixture.run(readRating(text))

    expect(outcome).toEqual({
      exitCode: 2,
      output: { error: { code: 'invalid_usage', message } },
    })
  })

  test('is shown with a comma, without a needless decimal', () => {
    expect([5, 4.5, 0.5, 4.75].map(formatRating)).toEqual([
      '5',
      '4,5',
      '0,5',
      '4,75',
    ])
  })
})
