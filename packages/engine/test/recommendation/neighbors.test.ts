// `tests/test_vizinhanca.py`: MovieLens item-item neighbourhood, "de N
// pessoas que deram 4+ a X, P% deram 4+ a Y". In the fixture (`vizinhos`),
// films 1001 to 1005 link to Bruno's and Iara's Notas only through it.

import { describe, expect, test } from 'vite-plus/test'
import type { Recommendation } from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'
import {
  engineRecommendation,
  film,
  pythonOk,
  PYTHON_TIMEOUT,
} from './support.ts'

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

describe('the neighbourhood path', { timeout: PYTHON_TIMEOUT }, () => {
  test('a large base and a high share give strong Evidence', async () => {
    const fixture = useFixture()
    const e = one(await all(fixture), 'A Casa das Marés')

    expect(e?.text).toBe(
      'deu 5 a O Farol de Areia (2012), e de 3.104 pessoas que deram 4+ a ele, 64% deram 4+ a este',
    )
    expect([e?.strength, e?.source, e?.date]).toEqual([
      'strong',
      'MovieLens ml-32m',
      '2023-10-13',
    ])
    expect(e?.contribution).toBe(1.0)
    const ids = pythonOk(fixture, [
      'consultar',
      "SELECT fato_id FROM vizinhos WHERE vizinho_id = 'tt9001001'",
    ]) as { linhas: string[][] }
    expect(ids.linhas.map(([id]) => id)).toContain(e?.factId)
  })

  test('a smaller base and share give moderate or weak Evidence', async () => {
    const out = await all(useFixture())

    const moderate = one(out, 'Segunda Chamada')
    const weak = one(out, 'O Mapa Rasgado')
    expect([moderate?.strength, moderate?.contribution]).toEqual([
      'moderate',
      0.6,
    ])
    expect(
      moderate?.text.endsWith(
        'de 250 pessoas que deram 4+ a ele, 44% deram 4+ a este',
      ),
    ).toBe(true)
    expect([weak?.strength, weak?.contribution]).toEqual(['weak', 0.3])
  })

  test('a neighbourhood below the floor is no Evidence', async () => {
    const out = await all(useFixture())

    // A Casa das Marés is also next to Cidade de Vidro, but only 20% of 600;
    // O Mapa Rasgado is next to O Farol de Areia with 80%, of a base of 25.
    expect(one(out, 'A Casa das Marés')?.text).toContain('O Farol de Areia')
    expect(one(out, 'O Mapa Rasgado')?.text).toContain('Maré Baixa')
  })

  test('the neighbourhood is never stronger than the seed Nota', async () => {
    const out = await all(useFixture())

    // Both would be strong. Rio Abaixo got 3.5 (a weak seed); Fronteira got
    // 5 in 2019, more than 5 years ago (a moderate seed).
    expect(
      Object.fromEntries(
        reviews(out, 'Luz de Inverno').map((e) => [
          e.text.split(', e de')[0],
          e.strength,
        ]),
      ),
    ).toEqual({
      'deu 3,5 a Rio Abaixo (2014)': 'weak',
      'deu 5 a Fronteira (2008)': 'moderate',
    })
  })

  test("a Feedback Nota raises the neighbourhood's strength", async () => {
    // Sessions and Feedback are not ported yet: the Python opens and closes
    // the Session.
    const fixture = useFixture()
    const opened = pythonOk(fixture, [
      'recomendar',
      '--presentes',
      'dono',
      '--quantos',
      '50',
    ]) as { sessao: { id: string } }
    pythonOk(fixture, [
      'feedback',
      '--sessao',
      opened.sessao.id,
      '--filme',
      'Rio Abaixo',
      '--nota',
      'dono=3,5',
    ])

    const [e] = reviews(await all(fixture), 'Luz de Inverno').filter((x) =>
      x.text.startsWith('deu 3,5 a Rio Abaixo'),
    )
    expect(e?.strength).toBe('moderate')
  })

  test('a rating against is no seed', async () => {
    // Bruno gave 1 to Barulho, and 70% of whoever gave 4+ to Barulho gave
    // 4+ to Ruído Branco.
    const texts = reviews(await all(useFixture()), 'Ruído Branco').map(
      (e) => e.text,
    )

    expect(texts).toHaveLength(1)
    expect(texts[0]?.startsWith('deu 5 a Fronteira (2008)')).toBe(true)
  })

  test('it holds for each Presente with her own Notas', async () => {
    const e = one(
      await all(useFixture(), 'dono', 'iara'),
      'Ruído Branco',
      'iara',
    )

    expect(e?.text).toBe(
      'deu 4 a Fronteira (2008), e de 150 pessoas que deram 4+ a ele, 42% deram 4+ a este',
    )
    expect(e?.strength).toBe('moderate')
  })

  const anaSays = (fixture: Fixture, action: 'declarar' | 'relatar') => {
    pythonOk(fixture, ['pessoa', 'criar', 'Ana', '--slug', 'ana'])
    pythonOk(fixture, [
      'pessoa',
      action,
      'ana',
      'ama O Farol',
      '--filme',
      'tt9000101',
      '--reacao',
      'ama',
    ])
    pythonOk(fixture, ['reconstruir'])
  }

  test('a stated rating is a seed, with the stated wording and ruler', async () => {
    const fixture = useFixture()
    anaSays(fixture, 'declarar')

    const e = one(await all(fixture, 'ana'), 'A Casa das Marés', 'ana')
    expect(e?.text).toBe(
      'disse que ama O Farol de Areia (2012), e de 3.104 pessoas que deram 4+ a ele, 64% deram 4+ a este',
    )
    expect(e?.strength).toBe('strong')
  })

  test('a Relato that she loves a film is a seed one level below', async () => {
    const fixture = useFixture()
    anaSays(fixture, 'relatar')

    const e = one(await all(fixture, 'ana'), 'A Casa das Marés', 'ana')
    expect(
      e?.text.startsWith(
        'segundo o Dono, ama O Farol de Areia (2012), e de 3.104 pessoas',
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
        'de 600 pessoas que deram 4+ a ele, 40% deram 4+ a este',
      ),
    ).toBe(true)
    expect(weak?.strength).toBe('weak')
    expect(
      weak?.text.endsWith(
        'de 600 pessoas que deram 4+ a ele, 25% deram 4+ a este',
      ),
    ).toBe(true)
  })
})
