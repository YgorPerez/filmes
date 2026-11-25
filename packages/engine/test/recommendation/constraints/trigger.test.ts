// `tests/test_restricoes.py`, the trigger cases (`triggers`) and the
// attributions. Does the Dog Die recorded, topic "a dog dies":
//   As Horas Lentas 12 yes, 2 no; A Volta do Mar 3 yes, 2 no     -> out
//   Sal e Ferrugem 1 yes, 14 no; Cidade de Vidro 2 yes, 0 no (few votes);
//   Noite de Estreia 3 yes, 3 no (tie)                           -> pass
//   O Farol de Areia (only "there are jump scares"), Maré Baixa (no
//   record): no information

import { describe, expect, test } from 'vite-plus/test'
import { Effect } from 'effect'
import {
  constraintLabel,
  readConstraints,
  recommend,
  storedConstraints,
  type EvidenceJson,
  type Recommendation,
  type RecommendedFilm,
  type Vars,
} from '../../../src/index.ts'
import { useFixture, type Fixture } from '../../fixture.ts'
import { RECORDINGS } from '../../sources/support.ts'
import {
  expectRecordedRecommendation,
  engineRecommendation,
  film,
  titles,
  weightsWith,
  withoutPosterWarning,
} from '../support.ts'

const DOG = 'a dog dies'
const WITH_DDD = {
  FILMES_DDD_CHAVE: 'chave-de-teste',
  FILMES_GRAVACOES: RECORDINGS,
} as const

const all = (
  fixture: Fixture,
  triggers: ReadonlyArray<string>,
  vars: Vars = WITH_DDD,
): Promise<Recommendation> =>
  engineRecommendation(
    fixture,
    {
      attendees: ['dono'],
      count: 100,
      ...(triggers.length > 0 && { triggers }),
    },
    vars,
  )

/** The film lines but the IMDb rating's (#56). */
const filmLines = (f: RecommendedFilm): EvidenceJson[] => {
  const lines = f.filmLines.filter((e) => !e.text.endsWith(' no IMDb'))
  for (const line of lines) expect(line.person).toBeNull()
  return lines
}

describe('a trigger', () => {
  test('removes a film with 3 or more votes and more yes than no', async () => {
    const out = new Set(titles(await all(useFixture(), [DOG])))

    expect(out.has('As Horas Lentas')).toBe(false)
    expect(out.has('A Volta do Mar')).toBe(false)
    for (const title of [
      'Sal e Ferrugem',
      'Cidade de Vidro',
      'Noite de Estreia',
    ])
      expect(out.has(title)).toBe(true)
  })

  test('the line quotes Does the Dog Die as it came', async () => {
    const [line, ...rest] = filmLines(
      film(await all(useFixture(), [DOG]), 'Sal e Ferrugem'),
    )

    expect(rest).toEqual([])
    expect(line?.text).toBe(
      'Does the Dog Die, "a dog dies": 1 sim, 14 não. Powered by DoesTheDogDie.com',
    )
    expect([
      line?.source,
      line?.date,
      line?.strength,
      line?.kind,
      line?.factId,
    ]).toEqual([
      'Does the Dog Die',
      '2026-11-20',
      'strong',
      'metadata',
      'ddd:tt9000105',
    ])
  })

  test('with no information from Does the Dog Die the film stays, with a warning line', async () => {
    const out = await all(useFixture(), [DOG])

    for (const title of ['O Farol de Areia', 'Maré Baixa']) {
      const [line, ...rest] = filmLines(film(out, title))
      expect(rest).toEqual([])
      expect(line?.text).toBe(
        'sem informação do Does the Dog Die sobre "a dog dies"',
      )
      expect([line?.kind, line?.strength, line?.factId]).toEqual([
        'guess',
        'weak',
        null,
      ])
    }
  })

  test('each trigger asked holds on its own', async () => {
    const out = await all(useFixture(), [DOG, 'there are jump scares'])

    expect(titles(out)).not.toContain('Sal e Ferrugem') // 8 yes, 1 no on jump scares
    expect(filmLines(film(out, 'O Farol de Areia'))).toHaveLength(2)
  })

  test('without the key nobody is out and every film has a warning line', async () => {
    const out = await all(useFixture(), [DOG], { FILMES_GRAVACOES: RECORDINGS })

    expect(titles(out)).toContain('As Horas Lentas')
    for (const f of out.films) expect(filmLines(f)[0]?.kind).toBe('guess')
    const [warning, ...rest] = withoutPosterWarning(out.warnings)
    expect(rest).toEqual([])
    expect(warning).toContain('Does the Dog Die')
    expect(warning).toContain('FILMES_DDD_CHAVE')
  })

  test('past the top Does the Dog Die is not asked', async () => {
    // A Volta do Mar is 7th in the order: with a reach of 3 it has no
    // information instead of being out.
    const fixture = useFixture()
    const weights = weightsWith(
      fixture,
      'alcance_sob_demanda = 50',
      'alcance_sob_demanda = 3',
    )
    const out = await all(fixture, [DOG], { ...WITH_DDD, ...weights })

    expect(filmLines(film(out, 'A Volta do Mar'))[0]?.kind).toBe('guess')
  })

  test('an empty topic is invalid usage; a repeated one counts once', async () => {
    const outcome = await useFixture().run(
      recommend({ attendees: ['dono'], triggers: [DOG, '  '] }),
    )
    expect(outcome.exitCode).toBe(2)
    expect(outcome.output).toEqual({
      error: { code: 'invalid_usage', message: '--gatilho vazio' },
    })

    const out = await all(useFixture(), [DOG, ` ${DOG} `])
    expect(out.constraints['trigger']).toMatchObject({ themes: [DOG] })
  })
})

describe('the attributions', () => {
  const IMDB = {
    source: 'IMDb',
    text: 'Information courtesy of IMDb (https://www.imdb.com). Used with permission.',
  }
  const DDD = {
    source: 'Does the Dog Die',
    text: 'Powered by DoesTheDogDie.com',
  }

  test('always have the IMDb', async () => {
    expect((await all(useFixture(), [])).attributions).toEqual([IMDB])
  })

  test('have Does the Dog Die when its data shows', async () => {
    expect((await all(useFixture(), [DOG])).attributions).toEqual([IMDB, DDD])
  })

  test('without information from Does the Dog Die there is no credit to it', async () => {
    const out = await all(useFixture(), [DOG], { FILMES_GRAVACOES: RECORDINGS })

    expect(out.attributions).toEqual([IMDB])
  })
})

test('what the Session keeps, and how it reads', () => {
  const stored = Effect.runSync(
    readConstraints({ triggers: [DOG, 'there are jump scares'] }).pipe(
      Effect.map(storedConstraints),
    ),
  )

  expect(stored).toEqual([
    { name: 'trigger', themes: [DOG, 'there are jump scares'] },
  ])
  expect(constraintLabel(stored[0] as (typeof stored)[number])).toBe(
    'sem “a dog dies”, “there are jump scares”',
  )
})

describe('the whole output, as recorded', () => {
  const cases: ReadonlyArray<[string, string[], Vars]> = [
    ['one topic', [DOG], WITH_DDD],
    ['two topics', [DOG, 'there are jump scares'], WITH_DDD],
    ['without the key', [DOG], { FILMES_GRAVACOES: RECORDINGS }],
  ]

  test.each(cases)('trigger, %s', async (_, triggers, vars) => {
    await expectRecordedRecommendation(
      useFixture(),
      { attendees: ['dono'], count: 100, triggers },
      vars,
    )
  })

  test('child and trigger together', async () => {
    const vars = { ...WITH_DDD, FILMES_OMDB_CHAVE: 'chave-de-teste' }
    await expectRecordedRecommendation(
      useFixture(),
      { attendees: ['dono'], count: 100, child: 14, triggers: [DOG] },
      vars,
    )
  })
})
