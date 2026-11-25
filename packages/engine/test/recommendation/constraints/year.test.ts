// `tests/test_restricao_ano.py`: `since` and `until` (`--desde`, `--ate`),
// both inclusive. Years in the fixture: O Farol de Areia 2012, Maré Baixa
// 2015, A Volta do Mar 2016, Cidade de Vidro 2018, As Horas Lentas 2021, Sal
// e Ferrugem 2023. The Cartaz's reading of the range is the label (the
// Cartaz is ported apart).

import { describe, expect, test } from 'vite-plus/test'
import {
  constraintLabel,
  recommend,
  type Recommendation,
  type RecommendRequest,
} from '../../../src/index.ts'
import { useFixture, type Fixture } from '../../fixture.ts'
import {
  expectRecordedRecommendation,
  engineRecommendation,
  film,
  titles,
} from '../support.ts'

const all = (
  fixture: Fixture,
  request: Partial<RecommendRequest> = {},
): Promise<Recommendation> =>
  engineRecommendation(fixture, { attendees: ['dono'], count: 100, ...request })

test('since removes the films released before the year', async () => {
  const out = titles(await all(useFixture(), { since: 2016 }))

  expect(out).toContain('A Volta do Mar') // 2016, at the limit
  expect(out).toContain('As Horas Lentas') // 2021
  expect(out).not.toContain('Maré Baixa') // 2015
  expect(out).not.toContain('O Farol de Areia') // 2012
})

test('until removes the films released after the year', async () => {
  const out = titles(await all(useFixture(), { until: 2018 }))

  expect(out).toContain('Cidade de Vidro') // 2018, at the limit
  expect(out).toContain('O Farol de Areia') // 2012
  expect(out).not.toContain('As Horas Lentas') // 2021
})

test('since and until together ask for the range', async () => {
  const out = await all(useFixture(), { since: 2015, until: 2016 })

  expect(out.films.length).toBeGreaterThan(0)
  for (const f of out.films) expect([2015, 2016]).toContain(f.year)
  expect(titles(out)).toEqual(
    expect.arrayContaining(['Maré Baixa', 'A Volta do Mar']),
  )
})

test('the answer repeats the range and how many films it removed', async () => {
  const fixture = useFixture()
  // Off, the Série na ordem (#165) takes no film the year left.
  const without = await all(fixture, { seriesOrder: 'off' })
  const out = await all(fixture, { since: 2016, seriesOrder: 'off' })

  expect(out.constraints['year']).toMatchObject({ since: 2016, until: null })
  const before = titles(without).filter((t) => !titles(out).includes(t))
  expect(before).toEqual(
    expect.arrayContaining(['Maré Baixa', 'O Farol de Areia']),
  )
  expect(out.constraints['year']?.['removed']).toBe(before.length)
})

test('a film in the range shows the year line', async () => {
  const out = await all(useFixture(), { since: 2015, until: 2016 })

  const [line, ...rest] = film(out, 'Maré Baixa').filmLines.filter(
    (l) => !l.text.startsWith('para ver sozinho:'),
  )
  expect(rest).toEqual([])
  expect(line?.person).toBeNull()
  expect(line?.text).toBe('lançado em 2015, entre 2015 e 2016')
  expect([line?.source, line?.strength, line?.kind]).toEqual([
    'IMDb',
    'strong',
    'metadata',
  ])
  expect(line?.factId).toBe('tt9000102')
  expect(line?.contribution).toBe(0)
})

test('the year line says the limit asked', async () => {
  const fixture = useFixture()
  const text = async (request: Partial<RecommendRequest>) =>
    film(await all(fixture, request), 'Maré Baixa')
      .filmLines.map((l) => l.text)
      .filter((t) => t.startsWith('lançado'))

  expect(await text({ since: 1990 })).toEqual([
    'lançado em 2015, de 1990 em diante',
  ])
  expect(await text({ until: 2015 })).toEqual(['lançado em 2015, até 2015'])
})

test('an inverted range is invalid usage', async () => {
  const outcome = await useFixture().run(
    recommend({ attendees: ['dono'], since: 2020, until: 2010 }),
  )

  expect(outcome).toEqual({
    exitCode: 2,
    output: {
      error: {
        code: 'invalid_usage',
        message: '--desde 2020 depois de --ate 2010',
      },
    },
  })
})

test('the stored range reads as the Cartaz shows it', () => {
  const label = (since: number | null, until: number | null) =>
    constraintLabel({ name: 'year', since, until })

  expect(label(1990, null)).toBe('de 1990 em diante')
  expect(label(null, 2015)).toBe('até 2015')
  expect(label(2012, 2016)).toBe('entre 2012 e 2016')
})

describe('the whole output, as recorded', () => {
  test.each<[Partial<RecommendRequest>]>([
    [{ since: 2016 }],
    [{ until: 2018 }],
    [{ since: 2015, until: 2016 }],
  ])('%j', async (request) => {
    await expectRecordedRecommendation(useFixture(), {
      attendees: ['dono'],
      count: 100,
      ...request,
    })
  })
})
