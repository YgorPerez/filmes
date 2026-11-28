// The Climas conhecido and desconhecido (#387): the pull comes from the
// film's IMDb votes, on a log scale from 1,000 to 1,000,000 votes centred at
// 31,623 (#386). In the fixture, Pequenos Milagres has 80,000 votes, Maré
// Baixa 32,000, Dia de Feira 13,000 and Mar Aberto 1,000.

import { describe, expect, test } from 'vite-plus/test'
import type { Recommendation } from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'
import { engineRecommendation, film, titles } from './support.ts'

const ask = (fixture: Fixture, moods: string[]): Promise<Recommendation> =>
  engineRecommendation(fixture, { attendees: ['dono'], count: 100, moods })

const moodLines = (out: Recommendation, title: string) =>
  film(out, title).filmLines.filter((l) => l.text.startsWith('Clima'))

describe('the Clima conhecido', () => {
  test('a film with many votes gets a line with its votes, as strong metadata', async () => {
    const out = await ask(useFixture(), ['conhecido'])

    const [line] = moodLines(out, 'Pequenos Milagres')
    expect(line).toMatchObject({
      person: null,
      text: 'Clima conhecido: 80.000 votos no IMDb',
      source: 'IMDb',
      strength: 'strong',
      kind: 'metadata',
    })
    // (log10(80,000) − 3) / 3 = 0.634; 2 × 0.634 − 1 = 0.269; × 0.1.
    expect(line?.contribution).toBeCloseTo(0.0269, 4)
  })

  test('a film below 31,623 votes gets no line, one just above a small one', async () => {
    const out = await ask(useFixture(), ['conhecido'])

    expect(moodLines(out, 'Dia de Feira')).toEqual([])
    // (log10(32,000) − 3) / 3 = 0.5017; 2 × 0.5017 − 1 = 0.0034; × 0.1.
    expect(moodLines(out, 'Maré Baixa')[0]?.contribution).toBe(0.0003)
  })
})

describe('the Clima desconhecido', () => {
  test('a film with few votes gets the line, one with many none', async () => {
    const out = await ask(useFixture(), ['desconhecido'])

    expect(moodLines(out, 'Mar Aberto')).toMatchObject([
      {
        text: 'Clima desconhecido: 1.000 votos no IMDb',
        strength: 'strong',
        kind: 'metadata',
        contribution: 0.1,
      },
    ])
    // (log10(13,000) − 3) / 3 = 0.371; 1 − 2 × 0.371 = 0.257; × 0.1.
    expect(moodLines(out, 'Dia de Feira')[0]?.contribution).toBeCloseTo(
      0.0257,
      4,
    )
    expect(moodLines(out, 'Pequenos Milagres')).toEqual([])
  })
})

describe('a Clima of popularity', () => {
  test('pulls the order, removes no film and is no Fact', async () => {
    const fixture = useFixture()
    const without = await ask(fixture, [])
    const unknown = await ask(fixture, ['desconhecido'])

    expect(titles(unknown).sort()).toEqual(titles(without).sort())
    expect(titles(unknown).indexOf('Mar Aberto')).toBeLessThan(
      titles(without).indexOf('Mar Aberto'),
    )
    // Dono has no Fact about Mar Aberto: it stays "só palpites".
    expect(film(unknown, 'Mar Aberto').onlyGuesses).toBe(true)
  })
})
