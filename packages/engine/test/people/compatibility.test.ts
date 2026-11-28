// The Compatibilidade [compatibility] between Pessoas (#403): on her page,
// how close each other Pessoa rates the films both rated, each Nota read on
// its own Escala, and the films where they agree and diverge most.
//
// Every Pessoa of the fixture has fewer Notas than `[rating_percentile]
// min_ratings`, so each Nota is read on the MovieLens population: 1 is
// 0,04, 2 is 0,14, 3 is 0,41, 3,5 is 0,59, 4 is 0,77, 4,5 is 0,92 and 5 is
// 0,98. Bruno shares 4 films with Quim and 2 with Iara (LEIAME.md).
import { appendFileSync, cpSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import { personCompatibility, rebuild } from '../../src/index.ts'
import { ROOT, useFixture } from '../fixture.ts'
import { weightsWith } from '../recommendation/support.ts'

const MIN_SHARED = 'min_shared = 10\nfilms = 3'

describe('the compatibility between Pessoas', () => {
  test('with each Pessoa that shares enough films, closest first', async () => {
    const fixture = useFixture()
    const weights = weightsWith(
      fixture,
      MIN_SHARED,
      'min_shared = 2\nfilms = 3',
    )

    const compatibility = await fixture.ok(
      personCompatibility({ person: 'bruno' }),
      weights,
    )

    expect(compatibility.minShared).toBe(2)
    expect(compatibility.others.map((o) => [o.person, o.shared])).toEqual([
      ['iara', 2],
      ['quim', 4],
    ])
    const [iara, quim] = compatibility.others
    // 1 − mean(|0,98 − 0,41|, |0,98 − 0,77|) = 0,61.
    expect(iara?.agreement).toBeCloseTo(0.61)
    // 1 − mean(0,06, 0,33, 0,88, 0,84).
    expect(quim?.agreement).toBeCloseTo(0.4725)
  })

  test('the films where they agree and diverge most, never both', async () => {
    const fixture = useFixture()
    const weights = weightsWith(
      fixture,
      MIN_SHARED,
      'min_shared = 2\nfilms = 3',
    )

    const { others } = await fixture.ok(
      personCompatibility({ person: 'bruno' }),
      weights,
    )

    const quim = others.find((o) => o.person === 'quim')
    expect(quim?.name).toBe('Quim')
    // Her Nota and his, 1 to 10, as the app shows them.
    expect(quim?.agree).toEqual([
      {
        filmId: 'tt9000201',
        title: 'Ponte Aérea',
        year: 2016,
        mine: 9,
        theirs: 10,
      },
      {
        filmId: 'tt9000102',
        title: 'Maré Baixa',
        year: 2015,
        mine: 9,
        theirs: 7,
      },
    ])
    expect(quim?.diverge).toEqual([
      { filmId: 'tt9000501', title: 'Barulho', year: 2013, mine: 2, theirs: 9 },
      {
        filmId: 'tt9000401',
        title: 'Fronteira',
        year: 2008,
        mine: 10,
        theirs: 4,
      },
    ])
    const iara = others.find((o) => o.person === 'iara')
    expect(iara?.agree.map((f) => f.filmId)).toEqual(['tt9000401'])
    expect(iara?.diverge.map((f) => f.filmId)).toEqual(['tt9000101'])
  })

  test('between films as close, the one both liked more agrees first', async () => {
    const fixture = useFixture()
    // Iara gives Rio Abaixo (303) and Inverno em Lisboa (402) what Bruno gave:
    // 3,5 (0,59) and 4 (0,77). Both are 0 apart; 402 is higher.
    const catalog = join(fixture.root, 'catalogo')
    cpSync(join(ROOT, 'tests/fixture/catalogo'), catalog, { recursive: true })
    appendFileSync(
      join(catalog, 'notas.csv'),
      [
        'iara,tt9000303,3.5,2025-09-01,Letterboxd da Iara',
        'iara,tt9000402,4.0,2025-09-02,Letterboxd da Iara',
      ].join('\n') + '\n',
    )
    const vars = {
      FILMES_CATALOGO: catalog,
      ...weightsWith(fixture, MIN_SHARED, 'min_shared = 2\nfilms = 3'),
    }
    await fixture.ok(rebuild, vars)

    const { others } = await fixture.ok(
      personCompatibility({ person: 'bruno' }),
      vars,
    )

    const iara = others.find((o) => o.person === 'iara')
    expect(iara?.shared).toBe(4)
    expect(iara?.agree.map((f) => f.filmId)).toEqual(['tt9000402', 'tt9000303'])
    expect(iara?.diverge.map((f) => f.filmId)).toEqual([
      'tt9000101',
      'tt9000401',
    ])
  })

  test('below the minimum of shared films, no one', async () => {
    const fixture = useFixture()

    const compatibility = await fixture.ok(
      personCompatibility({ person: 'bruno' }),
    )

    expect(compatibility).toEqual({
      person: 'bruno',
      minShared: 10,
      others: [],
    })
  })

  test('a name of no one fails', async () => {
    const fixture = useFixture()

    const outcome = await fixture.run(
      personCompatibility({ person: 'ninguém' }),
    )

    expect(outcome.output).toMatchObject({ error: { code: 'unknown_person' } })
  })
})
