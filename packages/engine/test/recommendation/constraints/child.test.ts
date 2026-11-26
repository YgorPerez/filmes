// `tests/test_restricoes.py`, the child cases (`child`). In the fixture
// (classificacoes.csv, adultos.csv):
//   L: O Farol de Areia (ClassInd L), Maré Baixa (Kijkwijzer AL; CNC "tous
//      publics" does not count)
//   6: Cidade de Vidro (FSK 6), A Volta do Mar (Medierådet 7), Asfalto
//      Quente (ClassInd 6)
//   12: As Horas Lentas (ClassInd 12, which beats MPA R), Sal e Ferrugem
//       (MPA PG and BBFC 12A: the highest holds), O Último Bonde (CNC -12)
//   14: Rio Abaixo (MPA PG-13). 16: Fronteira (MPA R), Barulho (BBFC 15),
//       Explosão Final (Medierådet 15, FSK 16)
//   no local rating: Noite de Estreia (only EIRIN G), Vento Norte, Inverno
//   em Lisboa, Ponte Aérea
//   Jardim Suspenso: isAdult on IMDb
// OMDb recordings: Vento Norte PG, Noite de Estreia PG-13, Inverno em
// Lisboa Not Rated, Jardim Suspenso G (but isAdult), Ponte Aérea no record.

import { describe, expect, test } from 'vite-plus/test'
import { Effect } from 'effect'
import {
  consult,
  constraintLabel,
  readConstraints,
  rebuild,
  recommend,
  storedConstraints,
  type EvidenceJson,
  type Recommendation,
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

const ONLY_L = new Set(['O Farol de Areia', 'Maré Baixa'])
const UP_TO_6 = new Set([
  ...ONLY_L,
  'Cidade de Vidro',
  'A Volta do Mar',
  'Asfalto Quente',
])
const UP_TO_12 = new Set([
  ...UP_TO_6,
  'As Horas Lentas',
  'Sal e Ferrugem',
  'O Último Bonde',
])

const WITH_OMDB = {
  FILMES_OMDB_CHAVE: 'chave-de-teste',
  FILMES_GRAVACOES: RECORDINGS,
} as const

/** No key and no recordings: only the cache answers. */
const OFFLINE = {
  FILMES_OMDB_CHAVE: undefined,
  FILMES_DDD_CHAVE: undefined,
  FILMES_GRAVACOES: '/nonexistent/recordings',
} as const

const all = (
  fixture: Fixture,
  child: number,
  vars: Vars = {},
): Promise<Recommendation> =>
  engineRecommendation(
    fixture,
    { attendees: ['dono'], count: 100, child },
    vars,
  )

const ratingLine = (out: Recommendation, title: string): EvidenceJson => {
  const lines = film(out, title).filmLines.filter(
    (e: EvidenceJson) => !e.text.endsWith(' no IMDb'),
  )
  expect(lines).toHaveLength(1)
  for (const line of lines) expect(line.person).toBeNull()
  return lines[0] as EvidenceJson
}

describe('the local rating chain', () => {
  test('a child of 7 gets only films up to 6', async () => {
    expect(new Set(titles(await all(useFixture(), 7)))).toEqual(UP_TO_6)
  })

  test('a child with no age holds as L', async () => {
    expect(new Set(titles(await all(useFixture(), 0)))).toEqual(ONLY_L)
  })

  test('a child of 12 gets up to 12', async () => {
    expect(new Set(titles(await all(useFixture(), 12)))).toEqual(UP_TO_12)
  })

  test('a child of 17 gets no adult film and none without a rating', async () => {
    const out = new Set(titles(await all(useFixture(), 17)))

    expect(out.has('Jardim Suspenso')).toBe(false) // isAdult
    expect(out.has('Vento Norte')).toBe(false) // no rating anywhere
    expect(out.has('Fronteira')).toBe(true) // 16
  })

  test('ClassInd holds directly, with no conversion', async () => {
    const fixture = useFixture()
    const line = ratingLine(await all(fixture, 12), 'As Horas Lentas')

    expect(line.text).toBe('classificação 12 (ClassInd)')
    expect([line.source, line.date, line.strength, line.kind]).toEqual([
      'Wikidata P3216',
      '2026-11-20',
      'strong',
      'metadata',
    ])
    const { rows } = await fixture.ok(
      consult(
        "SELECT fato_id FROM classificacoes WHERE filme_id = 'tt9000104' AND propriedade = 'P3216'",
      ),
    )
    expect(rows.map(([id]) => id)).toContain(line.factId)
  })

  test('without ClassInd the highest rating holds and the line says it was converted', async () => {
    const out = await all(useFixture(), 12)

    expect(ratingLine(out, 'Sal e Ferrugem').text).toBe(
      'classificação 12 (BBFC 12A convertida)',
    )
    expect(ratingLine(out, 'Sal e Ferrugem').source).toBe('Wikidata P2629')
    expect(ratingLine(out, 'Maré Baixa').text).toBe(
      'classificação L (Kijkwijzer AL convertida)',
    )
    expect(ratingLine(out, 'A Volta do Mar').text).toBe(
      'classificação 6 (Medierådet 7 convertida)',
    )
  })
})

describe('the local rating chain', () => {
  test('a label that already has the system name does not repeat it', async () => {
    // FSK writes "FSK 6".
    expect(
      ratingLine(await all(useFixture(), 12), 'Cidade de Vidro').text,
    ).toBe('classificação 6 (FSK 6 convertida)')
  })

  test('an age outside 0 to 17 is invalid usage', async () => {
    for (const child of [18, -1]) {
      const outcome = await useFixture().run(
        recommend({ attendees: ['dono'], child }),
      )
      expect(outcome.exitCode).toBe(2)
      expect(outcome.output).toEqual({
        error: {
          code: 'invalid_usage',
          message: '--crianca: idade de 0 a 17 (sem idade vale L)',
        },
      })
    }
  })
})

describe("OMDb's Rated, for a film with no local rating", () => {
  test('is converted by the MPA row', async () => {
    const out = await all(useFixture(), 10, WITH_OMDB)

    expect(titles(out)).toContain('Vento Norte')
    const line = ratingLine(out, 'Vento Norte')
    expect(line.text).toBe('classificação 10 (MPA PG convertida)')
    expect([line.source, line.date, line.factId]).toEqual([
      'OMDb',
      '2026-11-20',
      'omdb:tt9000302',
    ])
    expect(titles(out)).not.toContain('Noite de Estreia') // PG-13 is 14
    expect(titles(out)).not.toContain('Inverno em Lisboa') // Not Rated
    expect(titles(out)).not.toContain('Ponte Aérea') // OMDb does not know it
  })

  test('also passes higher ratings', async () => {
    expect(titles(await all(useFixture(), 14, WITH_OMDB))).toContain(
      'Noite de Estreia',
    )
  })

  test('an adult film is out without asking OMDb', async () => {
    expect(titles(await all(useFixture(), 17, WITH_OMDB))).not.toContain(
      'Jardim Suspenso',
    )
  })

  test('without the key the film is out, with a warning', async () => {
    const out = await all(useFixture(), 10, { FILMES_GRAVACOES: RECORDINGS })

    expect(new Set(titles(out))).toEqual(UP_TO_6)
    const [warning, ...rest] = withoutPosterWarning(out.warnings)
    expect(rest).toEqual([])
    expect(warning).toContain('OMDb')
    expect(warning).toContain('FILMES_OMDB_CHAVE')
  })

  test('the answer stays in the cache for 30 days', async () => {
    const fixture = useFixture()
    await all(fixture, 10, WITH_OMDB)

    const cached = await all(fixture, 10, OFFLINE)
    expect(ratingLine(cached, 'Vento Norte').date).toBe('2026-11-20')
    expect(
      titles(await all(fixture, 10, { ...OFFLINE, FILMES_HOJE: '2026-12-19' })),
    ).toContain('Vento Norte')
    expect(
      titles(await all(fixture, 10, { ...OFFLINE, FILMES_HOJE: '2026-12-20' })),
    ).not.toContain('Vento Norte')
  })
})

describe("OMDb's Rated, for a film with no local rating", () => {
  test('the cache survives a rebuild', async () => {
    const fixture = useFixture()
    await all(fixture, 10, WITH_OMDB)
    await fixture.ok(rebuild)

    expect(titles(await all(fixture, 10, OFFLINE))).toContain('Vento Norte')
  })

  test('only the films that would reach the top ask OMDb', async () => {
    // With a child of 10, Vento Norte is 6th in the order; with a reach of
    // 3 it is not asked and is out.
    const fixture = useFixture()
    const weights = weightsWith(
      fixture,
      'on_demand_reach = 50',
      'on_demand_reach = 3',
    )

    expect(
      titles(await all(fixture, 10, { ...WITH_OMDB, ...weights })),
    ).not.toContain('Vento Norte')
  })
})

describe('what the Session keeps', () => {
  const stored = (child: number) =>
    Effect.runSync(
      readConstraints({ child }).pipe(Effect.map(storedConstraints)),
    )

  test('the age and the highest rating, and how it reads', () => {
    expect(stored(7)).toEqual([{ name: 'child', age: 7, max_age_rating: '6' }])
    expect(stored(0)).toEqual([{ name: 'child', age: 0, max_age_rating: 'L' }])
    expect(constraintLabel({ name: 'child', age: 7 })).toBe(
      'com criança de 7 anos',
    )
    expect(constraintLabel({ name: 'child', age: 0 })).toBe('com criança')
  })
})

describe('the whole output, as recorded', () => {
  const cases: ReadonlyArray<[string, number, Vars]> = [
    ['no age', 0, {}],
    ['12, local chain only', 12, {}],
    ['10 with OMDb', 10, WITH_OMDB],
    ['17 with OMDb', 17, WITH_OMDB],
    ['10 without the OMDb key', 10, { FILMES_GRAVACOES: RECORDINGS }],
  ]

  test.each(cases)('child %s', async (_, child, vars) => {
    await expectRecordedRecommendation(
      useFixture(),
      { attendees: ['dono'], count: 100, child },
      vars,
    )
  })
})

test('the answer repeats the age and the highest rating', async () => {
  const out = await all(useFixture(), 7)

  const child = out.constraints['child'] as Record<string, unknown>
  expect(child['age']).toBe(7)
  expect(child['maxAgeRating']).toBe('6')
  expect(child['removed']).toBeGreaterThan(0)
  expect(out.films).toHaveLength(UP_TO_6.size)
})
