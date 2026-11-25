// `tests/test_restricoes.py`, the local cases: duration, language and "sem
// Já visto". Without a Restrição, Bruno gets with `count: 100` every film
// with enough votes, the ones with a Fact before the guesses. Each
// Restrição removes films before the order and puts, in each film that
// passed, a line (Evidence with `person` null) saying why. The child and
// trigger cases are in `child.test.ts` and `trigger.test.ts`.

import { describe, expect, test } from 'vite-plus/test'
import {
  consult,
  recommend,
  type EvidenceJson,
  type Recommendation,
  type RecommendedFilm,
  type RecommendRequest,
} from '../../../src/index.ts'
import { useFixture, type Fixture } from '../../fixture.ts'
import {
  bothEngines,
  engineRecommendation,
  film,
  titles,
  PYTHON_TIMEOUT,
} from '../support.ts'

const all = (
  fixture: Fixture,
  request: Partial<RecommendRequest> = {},
): Promise<Recommendation> =>
  engineRecommendation(fixture, { attendees: ['dono'], count: 100, ...request })

/** The film lines but the IMDb rating's (#56), which is no Restrição. */
const filmLines = (f: RecommendedFilm): EvidenceJson[] => {
  const lines = f.filmLines.filter((e) => !e.text.endsWith(' no IMDb'))
  for (const line of lines) expect(line.person).toBeNull()
  return lines
}

const invalid = async (
  fixture: Fixture,
  request: Partial<RecommendRequest>,
) => {
  const outcome = await fixture.run(
    recommend({ attendees: ['dono'], ...request }),
  )
  expect(outcome.exitCode).toBe(2)
  return outcome.output as { error: { code: string; message: string } }
}

describe('the maximum duration', () => {
  test('removes the longer films', async () => {
    const out = await all(useFixture(), { maxDuration: 100 })

    for (const f of out.films) expect(f.runtimeMinutes).toBeLessThanOrEqual(100)
    expect(titles(out)).toContain('Maré Baixa') // 98 min
    expect(titles(out)).toContain('A Volta do Mar') // 100 min, at the limit
    expect(titles(out)).not.toContain('As Horas Lentas') // 104 min
  })

  test('a film that fits shows the duration line', async () => {
    const out = await all(useFixture(), { maxDuration: 100 })

    const [line, ...rest] = filmLines(film(out, 'Maré Baixa'))
    expect(rest).toEqual([])
    expect(line?.text).toBe('duração 1h38, dentro do limite de 1h40')
    expect([line?.source, line?.strength, line?.kind]).toEqual([
      'IMDb',
      'strong',
      'metadata',
    ])
    expect(line?.factId).toBe('tt9000102')
    expect(line?.contribution).toBe(0)
  })

  test('the answer repeats the Restrições asked and how many films each removed', async () => {
    const out = await all(useFixture(), { maxDuration: 100 })

    const duration = out.constraints['duration'] as Record<string, number>
    expect(duration['maxMinutes']).toBe(100)
    expect(duration['removed']).toBeGreaterThan(0)
  })

  test('below 1 minute is invalid usage', async () => {
    expect((await invalid(useFixture(), { maxDuration: 0 })).error).toEqual({
      code: 'invalid_usage',
      message: '--duracao-max precisa ser 1 minuto ou mais',
    })
  })
})

test('with no Restrição there is no film line', async () => {
  const out = await all(useFixture())

  expect(out.constraints).toEqual({})
  // Only the group/alone line (#21), which every Session has, and the IMDb
  // rating's (#56) are left.
  for (const f of out.films)
    for (const line of filmLines(f))
      expect(line.text.startsWith('para ver sozinho:')).toBe(true)
})

describe('the original language', () => {
  const PORTUGUESE = [
    'O Farol de Areia',
    'Maré Baixa',
    'Cidade de Vidro',
    'As Horas Lentas',
    'Sal e Ferrugem',
    'Jardim Suspenso',
  ]

  test('passes only the films with that original language', async () => {
    // Helena Prado films in Portuguese; Jardim Suspenso has Portuguese and
    // Spanish.
    expect(
      new Set(titles(await all(useFixture(), { language: 'pt' }))),
    ).toEqual(new Set(PORTUGUESE))
  })

  test('holds by code, by name or by Wikidata item', async () => {
    const fixture = useFixture()
    const byCode = titles(await all(fixture, { language: 'pt' }))

    expect(titles(await all(fixture, { language: 'Português' }))).toEqual(
      byCode,
    )
    expect(titles(await all(fixture, { language: ' Q5146 ' }))).toEqual(byCode)
  })

  test('a film in that language shows the language line', async () => {
    const fixture = useFixture()
    const out = await all(fixture, { language: 'pt' })

    const [line, ...rest] = filmLines(film(out, 'Jardim Suspenso'))
    expect(rest).toEqual([])
    expect(line?.text).toBe('idioma original português')
    expect([line?.source, line?.date, line?.strength, line?.kind]).toEqual([
      'Wikidata P364',
      '2026-11-20',
      'strong',
      'metadata',
    ])
    const { rows } = await fixture.ok(
      consult(
        "SELECT fato_id FROM idiomas_originais WHERE filme_id = 'tt9000301' AND codigo = 'pt'",
      ),
    )
    expect(rows.map(([id]) => id)).toContain(line?.factId)
  })

  test('a blank language is invalid usage', async () => {
    expect((await invalid(useFixture(), { language: ' \t' })).error).toEqual({
      code: 'invalid_usage',
      message: '--idioma vazio',
    })
  })
})

test('"sem Já visto" removes the films some Presente has seen', async () => {
  const fixture = useFixture()
  const { rows } = await fixture.ok(
    consult(
      "SELECT titulo FROM filmes JOIN notas ON notas.filme_id = filmes.id WHERE pessoa = 'bruno'",
    ),
  )
  const seen = new Set(rows.map(([title]) => title))
  // With the whole list, a seen film's place does not pull in a film from
  // outside the 50.
  const withSeen = titles(await all(fixture, { count: 80 }))
  const out = await all(fixture, { count: 80, unseen: true })

  const seenShown = withSeen.filter((t) => seen.has(t))
  expect(seenShown).toContain('O Farol de Areia')
  expect(new Set(titles(out))).toEqual(
    new Set(withSeen.filter((t) => !seen.has(t))),
  )
  for (const t of ['As Horas Lentas', 'Sal e Ferrugem', 'Vento Norte'])
    expect(titles(out)).toContain(t)
  expect(out.constraints['unseen']).toEqual({ removed: seenShown.length })
})

describe('equal to Python', { timeout: PYTHON_TIMEOUT }, () => {
  test.each<[string, string[], Partial<RecommendRequest>]>([
    ['duration', ['--duracao-max', '100'], { maxDuration: 100 }],
    ['language', ['--idioma', 'Português'], { language: 'Português' }],
    ['unseen', ['--sem-ja-visto'], { unseen: true }],
    [
      'all of them',
      [
        '--duracao-max',
        '110',
        '--idioma',
        'pt',
        '--sem-ja-visto',
        '--desde',
        '2013',
        '--sem-lento',
        '--sem-tristeza',
      ],
      {
        maxDuration: 110,
        language: 'pt',
        unseen: true,
        since: 2013,
        noSlow: true,
        noSad: true,
      },
    ],
  ])('%s', async (_, args, request) => {
    const { python, engine } = await bothEngines(
      useFixture(),
      ['--presentes', 'dono', '--quantos', '100', ...args],
      { attendees: ['dono'], count: 100, ...request },
    )
    expect(engine).toEqual(python)
  })
})
