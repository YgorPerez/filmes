// `tests/test_clima.py`: the Clima of the request and the group-or-alone
// signal, film lines with no Pessoa. In the fixture, films 1101 to 1110
// have MovieLens tags, Tag Genome scores and genres; all have the same weak
// Evidence for Bruno and Iara (neighbours of O Farol de Areia), so they tie
// on taste. See the fixture's LEIAME.

import { describe, expect, test } from 'vite-plus/test'
import type { Recommendation, RecommendRequest } from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'
import {
  engineRecommendation,
  film,
  pythonOk,
  titles,
  withoutPosterWarning,
  PYTHON_TIMEOUT,
} from './support.ts'

const ask = (
  fixture: Fixture,
  moods: string[] = [],
  attendees: string[] = ['dono'],
): Promise<Recommendation> =>
  engineRecommendation(fixture, {
    attendees,
    count: 50,
    moods,
  } satisfies RecommendRequest)

const lines = (out: Recommendation, title: string) =>
  film(out, title).filmLines.map((l) => [l.text, l.strength, l.kind])

describe('the Clima', { timeout: PYTHON_TIMEOUT }, () => {
  test('a Clima asked for gives a film line with the tag that backs it', async () => {
    const fixture = useFixture()
    const [line] = film(await ask(fixture, ['leve']), 'Dia de Feira').filmLines

    expect(line).toEqual({
      person: null,
      text: 'Clima leve: 14 usuários do MovieLens marcaram o filme com a tag "feel-good"',
      source: 'MovieLens ml-32m',
      date: '2023-10-13',
      strength: 'strong',
      kind: 'review',
      factId: line?.factId,
      contribution: 0.1,
    })
    const ids = pythonOk(fixture, [
      'consultar',
      "SELECT fato_id FROM tags_movielens WHERE filme_id = 'tt9001101'",
    ]) as { linhas: string[][] }
    expect(ids.linhas.map(([id]) => id)).toContain(line?.factId)
  })

  test('a Clima pulls the film up and removes none', async () => {
    // Dia de Feira and Outro Dia Qualquer tie on Bruno's taste; the second
    // has more votes.
    const fixture = useFixture()
    const without = titles(await ask(fixture))
    const light = titles(await ask(fixture, ['leve']))

    expect(without.indexOf('Outro Dia Qualquer')).toBeLessThan(
      without.indexOf('Dia de Feira'),
    )
    expect(light.indexOf('Dia de Feira')).toBeLessThan(
      light.indexOf('Outro Dia Qualquer'),
    )
    expect([...light].sort()).toEqual([...without].sort())
  })

  test('without a Clima there is no Clima line', async () => {
    const out = await ask(useFixture())

    expect(out.moods).toEqual([])
    expect(
      out.films.some((f) =>
        f.filmLines.some((l) => l.text.startsWith('Clima')),
      ),
    ).toBe(false)
  })

  test("the Clima line's strength follows the review ruler", async () => {
    const out = await ask(useFixture(), ['leve'])

    expect(lines(out, 'Tarde de Domingo')).toEqual([
      [
        'Clima leve: 5 usuários do MovieLens marcaram o filme com a tag "feel-good"',
        'moderate',
        'review',
      ],
    ])
    // Only 2 users gave "feel-good" to Bolo de Fubá: the Tag Genome counts.
    expect(lines(out, 'Bolo de Fubá')).toEqual([
      [
        'Clima leve: relevância 0,85 da tag "feel-good" para o filme no Tag Genome',
        'moderate',
        'review',
      ],
    ])
    // Pipa no Céu: 0.70 on "feel-good" is weak; 0.50 on "feel good movie" is out.
    expect(lines(out, 'Pipa no Céu')).toEqual([
      [
        'Clima leve: relevância 0,70 da tag "feel-good" para o filme no Tag Genome',
        'weak',
        'review',
      ],
    ])
  })

  test("a user count at the ruler's limit already has the strength", async () => {
    const out = await ask(useFixture(), ['leve'])

    expect(lines(out, 'Quermesse')).toEqual([
      [
        'Clima leve: 10 usuários do MovieLens marcaram o filme com a tag "feel-good"',
        'strong',
        'review',
      ],
    ])
    expect(lines(out, 'Piquenique')).toEqual([
      [
        'Clima leve: 3 usuários do MovieLens marcaram o filme com a tag "feel-good"',
        'moderate',
        'review',
      ],
    ])
  })

  test('the genome relevance has two places cut, never past the threshold', async () => {
    // 0.799 reads "0,79", not "0,80".
    const out = await ask(useFixture(), ['tenso'])

    expect(lines(out, 'Dia de Feira')).toEqual([
      [
        'Clima tenso: relevância 0,80 da tag "suspense" para o filme no Tag Genome',
        'moderate',
        'review',
      ],
    ])
    expect(lines(out, 'Bolo de Fubá')).toEqual([
      [
        'Clima tenso: relevância 0,79 da tag "suspense" para o filme no Tag Genome',
        'weak',
        'review',
      ],
    ])
    expect(lines(out, 'Carnaval de Rua')).toEqual([
      [
        'Clima tenso: relevância 0,60 da tag "suspense" para o filme no Tag Genome',
        'weak',
        'review',
      ],
    ])
    expect(lines(out, 'Outro Dia Qualquer')).toEqual([])
  })

  test("the Clima's genre is weak metadata", async () => {
    const [line] = film(
      await ask(useFixture(), ['pra rir']),
      'Carnaval de Rua',
    ).filmLines

    expect([line?.text, line?.source, line?.strength, line?.kind]).toEqual([
      'Clima pra rir: do gênero comédia cinematográfica',
      'Wikidata',
      'weak',
      'metadata',
    ])
  })

  test('each Clima gives one line only, the strongest', async () => {
    // Dia de Feira has "feel-good" (14), "funny" (12) and is a comedy,
    // which is in both Climas.
    const out = await ask(useFixture(), ['leve', 'pra rir'])

    expect(out.moods).toEqual(['leve', 'pra rir'])
    expect(lines(out, 'Dia de Feira')).toEqual([
      [
        'Clima leve: 14 usuários do MovieLens marcaram o filme com a tag "feel-good"',
        'strong',
        'review',
      ],
      [
        'Clima pra rir: 12 usuários do MovieLens marcaram o filme com a tag "funny"',
        'strong',
        'review',
      ],
    ])
  })

  test('a Clima outside the vocabulary is left out with a warning', async () => {
    const out = await ask(useFixture(), ['Leve', 'épico'])

    expect(out.moods).toEqual(['leve'])
    const warnings = withoutPosterWarning(out.warnings)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toContain("'épico' não está no vocabulário")
    expect(warnings[0]).toContain('pra rir') // the warning lists the vocabulary
    expect(lines(out, 'Dia de Feira')[0]?.[0]?.startsWith('Clima leve:')).toBe(
      true,
    )
  })

  test('a Clima holds without accent or capitals', async () => {
    const out = await ask(useFixture(), ['ACAO', 'Pra-Rir'])

    expect(out.moods).toEqual(['ação', 'pra rir'])
    expect(withoutPosterWarning(out.warnings)).toEqual([])
  })

  test('a Tag Genome line brings its attribution', async () => {
    const fixture = useFixture()
    const withGenome = await ask(fixture, ['leve'])
    const withoutGenome = await ask(fixture)

    const credit = withGenome.attributions.filter(
      (a) => a.source === 'Tag Genome',
    )
    expect(credit).toHaveLength(1)
    expect(credit[0]?.text).toContain(
      'Tag Genome 2021, de Kotkov, Maslov e Neovius',
    )
    expect(credit[0]?.text).toContain('CC BY-NC 3.0')
    expect(
      withoutGenome.attributions.some((a) => a.source === 'Tag Genome'),
    ).toBe(false)
  })

  test('a Clima backs the film even with no Fact about the Presente', async () => {
    // Teo has no Nota, but Dia de Feira has a Fact about the Clima.
    const out = await ask(useFixture(), ['leve'], ['teo'])

    const [first] = out.films
    expect(first?.title).toBe('Dia de Feira')
    expect(first?.onlyGuesses).toBe(false)
    expect(first?.utility).toEqual({ teo: null })
    expect(first?.evidence['teo']?.[0]?.text).toBe('sem fato')
    expect(film(out, 'Outro Dia Qualquer').onlyGuesses).toBe(true)
  })
})

// Sessão Maldita has "so bad it's good" (12 users); Silêncio no Lago has
// "meditative" (12) and 0.90 of "slow" in the genome. No Clima asked.
describe('group or alone', { timeout: PYTHON_TIMEOUT }, () => {
  test('a Session alone gives a bonus to the film good alone', async () => {
    const out = await ask(useFixture())

    expect(lines(out, 'Silêncio no Lago')).toEqual([
      [
        'para ver sozinho: 12 usuários do MovieLens marcaram o filme com a tag "meditative"',
        'strong',
        'review',
      ],
    ])
    expect(lines(out, 'Sessão Maldita')).toEqual([])
    const order = titles(out)
    expect(order.indexOf('Silêncio no Lago')).toBeLessThan(
      order.indexOf('Outro Dia Qualquer'),
    )
    expect(order.indexOf('Outro Dia Qualquer')).toBeLessThan(
      order.indexOf('Sessão Maldita'),
    )
  })

  test('a Session in a group gives a bonus to the film good in a group', async () => {
    const out = await ask(useFixture(), [], ['dono', 'iara'])

    const [line] = film(out, 'Sessão Maldita').filmLines
    expect(line?.text).toBe(
      'para ver em grupo: 12 usuários do MovieLens marcaram o filme com a tag "so bad it\'s good"',
    )
    expect([line?.person, line?.strength, line?.contribution]).toEqual([
      null,
      'strong',
      0.05,
    ])
    expect(lines(out, 'Silêncio no Lago')).toEqual([])
    const order = titles(out)
    expect(order.indexOf('Sessão Maldita')).toBeLessThan(
      order.indexOf('Outro Dia Qualquer'),
    )
    expect(order.indexOf('Outro Dia Qualquer')).toBeLessThan(
      order.indexOf('Silêncio no Lago'),
    )
  })
})
