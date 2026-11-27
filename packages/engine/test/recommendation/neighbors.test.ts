// `tests/test_vizinhanca.py`: MovieLens item-item neighbourhood, "das N
// pessoas que deram 4 ou mais a X, P% fizeram o mesmo com Y". In the fixture (`vizinhos`),
// films 1001 to 1005 link to Bruno's and Iara's Notas only through it.

import { describe, expect, test } from 'vite-plus/test'
import {
  consult,
  filmReason,
  personCreate,
  personReport,
  personState,
  recommendSession,
  recordFeedback,
  type Recommendation,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'
import { engineRecommendation, film } from './support.ts'

const all = (fixture: Fixture, ...attendees: string[]) =>
  engineRecommendation(fixture, {
    attendees: attendees.length > 0 ? attendees : ['dono'],
    count: 50,
  })

const reviews = (out: Recommendation, title: string, person = 'bruno') =>
  (film(out, title).evidence[person] ?? []).filter((e) => e.kind === 'review')

const one = (out: Recommendation, title: string, person = 'bruno') => {
  const found = reviews(out, title, person)
  expect(found).toHaveLength(1)
  return found[0]
}

describe('the neighbourhood path', () => {
  test('a large base and a high share give strong Evidence', async () => {
    const fixture = useFixture()
    const e = one(await all(fixture), 'A Casa das Marés')

    expect(e?.text).toBe(
      'deu 10 de 10 a O Farol de Areia (2012); das 3.104 pessoas que deram 8 ou mais a ele, 64% fizeram o mesmo com este',
    )
    expect([e?.strength, e?.source, e?.date]).toEqual([
      'strong',
      'MovieLens ml-32m',
      '2023-10-13',
    ])
    // Strong, ×0.8156 for the 5 of 2025-06-01 (a half-life of 5 years).
    expect(e?.contribution).toBe(0.8156)
    const ids = await fixture.ok(
      consult("SELECT fato_id FROM vizinhos WHERE vizinho_id = 'tt9001001'"),
    )
    expect(ids.rows.map(([id]) => id)).toContain(e?.factId)
  })

  test('a smaller base and share give moderate or weak Evidence', async () => {
    const out = await all(useFixture())

    const moderate = one(out, 'Segunda Chamada')
    const weak = one(out, 'O Mapa Rasgado')
    // Both from the 4.5 of 2024-02-10, which keeps ×0.6805.
    expect([moderate?.strength, moderate?.contribution]).toEqual([
      'moderate',
      0.4083,
    ])
    expect(
      moderate?.text.endsWith(
        'das 250 pessoas que deram 8 ou mais a ele, 44% fizeram o mesmo com este',
      ),
    ).toBe(true)
    expect([weak?.strength, weak?.contribution]).toEqual(['weak', 0.2042])
  })

  test('a neighbourhood below the floor is no Evidence', async () => {
    const out = await all(useFixture())

    // A Casa das Marés is also next to Cidade de Vidro, but only 20% of 600;
    // O Mapa Rasgado is next to O Farol de Areia with 80%, of a base of 25.
    expect(one(out, 'A Casa das Marés')?.text).toContain('O Farol de Areia')
    expect(one(out, 'O Mapa Rasgado')?.text).toContain('Maré Baixa')
  })
})

describe('the neighbourhood path', () => {
  test('the neighbourhood is never stronger than the seed Nota', async () => {
    const out = await all(useFixture())

    // Both would be strong. Rio Abaixo got 3.5 (a weak seed); Fronteira got
    // 5 in 2019 (a strong seed: age does not lower a Nota's Força).
    expect(
      Object.fromEntries(
        reviews(out, 'Luz de Inverno').map((e) => [
          e.text.split('; das')[0],
          e.strength,
        ]),
      ),
    ).toEqual({
      'deu 7 de 10 a Rio Abaixo (2014)': 'weak',
      'deu 10 de 10 a Fronteira (2008)': 'strong',
    })
  })

  test("the seed Nota's Decaimento scales the neighbourhood's weight", async () => {
    const out = await all(useFixture())

    // A half-life of 5 years: the 3.5 of 2023-03-03 keeps ×0.5972 of the
    // weak 0.3, the 5 of 2019-01-10 ×0.3363 of the strong 1.
    expect(
      Object.fromEntries(
        reviews(out, 'Luz de Inverno').map((e) => [
          e.text.split('; das')[0],
          e.contribution,
        ]),
      ),
    ).toEqual({
      'deu 7 de 10 a Rio Abaixo (2014)': 0.1792,
      'deu 10 de 10 a Fronteira (2008)': 0.3363,
    })
  })

  test("a Feedback Nota raises the neighbourhood's strength", async () => {
    const fixture = useFixture()
    const opened = await fixture.ok(
      recommendSession({ attendees: ['dono'], count: 50 }),
    )
    await fixture.ok(
      recordFeedback({
        session: opened.session.id,
        film: 'Rio Abaixo',
        ratings: ['dono=3,5'],
      }),
    )

    const [e] = reviews(await all(fixture), 'Luz de Inverno').filter((x) =>
      x.text.startsWith('deu 7 de 10 a Rio Abaixo'),
    )
    expect(e?.strength).toBe('moderate')
    // A Nota under 8 of 10 that the ruler reads for her says so, and the
    // share does not say "o mesmo" of what she did not do (#272).
    expect(e?.text).toBe(
      'deu 7 de 10 a Rio Abaixo (2014), uma das notas mais altas que dá; das 900 pessoas que deram 8 ou mais a ele, 70% deram 8 ou mais a este',
    )
  })

  test('the content path says the same of a Nota under 8 of 10 she rates high, and the Motivo reads both', async () => {
    const fixture = useFixture()
    const opened = await fixture.ok(
      recommendSession({ attendees: ['dono'], count: 50 }),
    )
    await fixture.ok(
      recordFeedback({
        session: opened.session.id,
        film: 'Rio Abaixo',
        ratings: ['dono=3,5'],
      }),
    )
    const out = await all(fixture)

    const content = (film(out, 'Vento Norte').evidence['bruno'] ?? []).find(
      (e) => e.text.startsWith('deu 7 de 10 a Rio Abaixo'),
    )
    expect(content?.text).toBe(
      'deu 7 de 10 a Rio Abaixo (2014), uma das notas mais altas que dá, também de Marta Quintal',
    )
    const [neighbour] = reviews(out, 'Luz de Inverno').filter((x) =>
      x.text.startsWith('deu 7 de 10 a Rio Abaixo'),
    )
    expect(
      [content, neighbour].map((line) =>
        filmReason({ bruno: line === undefined ? [] : [line] }),
      ),
    ).toEqual([
      { kind: 'entity', name: 'Marta Quintal', people: ['bruno'] },
      { kind: 'film', name: 'Rio Abaixo (2014)', people: ['bruno'] },
    ])
  })

  test('a weak seed under 8 of 10 says the share whole, with no qualifier', async () => {
    const [e] = reviews(await all(useFixture()), 'Luz de Inverno').filter(
      (x) => x.text.startsWith('deu 7 de 10 a Rio Abaixo'),
    )
    expect(e?.text).toBe(
      'deu 7 de 10 a Rio Abaixo (2014); das 900 pessoas que deram 8 ou mais a ele, 70% deram 8 ou mais a este',
    )
  })
})

describe('the neighbourhood path', () => {
  const anaSays = async (fixture: Fixture, how: 'states' | 'reports') => {
    await fixture.ok(personCreate({ name: 'Ana', slug: 'ana' }))
    const said = {
      person: 'ana',
      text: 'ama O Farol',
      target: 'tt9000101',
      reaction: 'love',
    } as const
    if (how === 'states') await fixture.ok(personState(said))
    else await fixture.ok(personReport(said))
  }

  test('a rating against is no seed', async () => {
    // Bruno gave 1 to Barulho, and 70% of whoever gave 4+ to Barulho gave
    // 4+ to Ruído Branco.
    const texts = reviews(await all(useFixture()), 'Ruído Branco').map(
      (e) => e.text,
    )

    expect(texts).toHaveLength(1)
    expect(texts[0]?.startsWith('deu 10 de 10 a Fronteira (2008)')).toBe(true)
  })

  test('it holds for each Presente with her own Notas', async () => {
    const e = one(
      await all(useFixture(), 'dono', 'iara'),
      'Ruído Branco',
      'iara',
    )

    expect(e?.text).toBe(
      'deu 8 de 10 a Fronteira (2008); das 150 pessoas que deram 8 ou mais a ele, 42% fizeram o mesmo com este',
    )
    expect(e?.strength).toBe('moderate')
  })

  test('a stated rating is a seed, with the stated wording and ruler', async () => {
    const fixture = useFixture()
    await anaSays(fixture, 'states')

    const e = one(await all(fixture, 'ana'), 'A Casa das Marés', 'ana')
    expect(e?.text).toBe(
      'disse que ama O Farol de Areia (2012); das 3.104 pessoas que deram 8 ou mais a ele, 64% fizeram o mesmo com este',
    )
    expect(e?.strength).toBe('strong')
  })
})

describe('the neighbourhood path', () => {
  const anaSays = async (fixture: Fixture, how: 'states' | 'reports') => {
    await fixture.ok(personCreate({ name: 'Ana', slug: 'ana' }))
    const said = {
      person: 'ana',
      text: 'ama O Farol',
      target: 'tt9000101',
      reaction: 'love',
    } as const
    if (how === 'states') await fixture.ok(personState(said))
    else await fixture.ok(personReport(said))
  }

  test('a Relato that she loves a film is a seed one level below', async () => {
    const fixture = useFixture()
    await anaSays(fixture, 'reports')

    const e = one(await all(fixture, 'ana'), 'A Casa das Marés', 'ana')
    expect(
      e?.text.startsWith(
        'segundo o Dono, ama O Farol de Areia (2012); das 3.104 pessoas',
      ),
    ).toBe(true)
    expect(e?.strength).toBe('moderate')
  })

  test("a share exactly at the ruler's limit already has the strength", async () => {
    const out = await all(useFixture())

    // Of 600 who gave 4+ to Cidade de Vidro, 240 (40%) and 150 (25%).
    const moderate = one(out, 'Porto Seguro')
    const weak = one(out, 'Canal Fundo')
    expect(moderate?.strength).toBe('moderate')
    expect(
      moderate?.text.endsWith(
        'das 600 pessoas que deram 8 ou mais a ele, 40% fizeram o mesmo com este',
      ),
    ).toBe(true)
    expect(weak?.strength).toBe('weak')
    expect(
      weak?.text.endsWith(
        'das 600 pessoas que deram 8 ou mais a ele, 25% fizeram o mesmo com este',
      ),
    ).toBe(true)
  })
})
