// The whole recommendation output, against the one recorded for each test
// (`expected.ts`): requests that cover each part of the pipeline. The
// snapshots hold what the Python engine answered on the same data.

import { describe, expect, test } from 'vite-plus/test'
import {
  personAdjust,
  personCreate,
  personReport,
  personState,
  personVeto,
  rebuild,
  recommendSession,
  recordFeedback,
} from '../../src/index.ts'
import { useFixture } from '../fixture.ts'
import { RECORDINGS } from '../sources/support.ts'
import { expectRecordedRecommendation, weightsWith } from './support.ts'

describe('the whole output, as recorded', () => {
  test.each([
    {
      name: 'the Dono alone, every film',
      request: { attendees: ['dono'], count: 100 },
    },
    {
      name: 'the default size, in a group',
      request: { attendees: ['dono', 'Iara'] },
    },
    {
      name: 'Presentes by comma, with someone with no Nota',
      request: { attendees: ['eu,teo'], count: 100 },
    },
    {
      name: 'the average rule',
      request: { attendees: ['dono', 'quim'], rule: 'average', count: 50 },
    },
    {
      name: "someone's rule, from --de alone",
      request: { attendees: ['dono', 'quim'], by: 'quim', count: 50 },
    },
    {
      name: "someone's rule, named",
      request: { attendees: ['dono', 'iara'], rule: 'by', by: 'Bruno' },
    },
    {
      name: 'Climas, one outside the vocabulary',
      request: {
        attendees: ['dono'],
        count: 50,
        moods: ['Leve', 'épico', 'pra rir'],
      },
    },
    {
      name: 'Climas without accents or case, someone with no Nota',
      request: {
        attendees: ['teo'],
        count: 50,
        moods: ['ACAO', 'Pra-Rir', 'tenso'],
      },
    },
    {
      name: 'the cast and director ceilings',
      request: { attendees: ['rosa'], count: 100 },
    },
  ] as const)('$name', async ({ request }) => {
    await expectRecordedRecommendation(useFixture(), request)
  })

  test('the poster, title and synopsis from the TMDB', async () => {
    const fixture = useFixture()
    const vars = { FILMES_TMDB_CHAVE: 'x', FILMES_GRAVACOES: RECORDINGS }
    const out = await expectRecordedRecommendation(
      fixture,
      { attendees: ['dono', 'iara'], count: 8 },
      vars,
    )
    expect(out.films.some((f) => f.poster)).toBe(true)
  })

  test('Vetos to a tag group and to a genre', async () => {
    const fixture = useFixture()
    await fixture.ok(personCreate({ name: 'Lorenzo', slug: 'lorenzo' }))
    await fixture.ok(
      personVeto({
        person: 'lorenzo',
        text: 'não vê romance',
        target: 'Q1054574',
      }),
    )
    await fixture.ok(
      personVeto({
        person: 'bruno',
        text: 'não quer comédia boba',
        target: 'silly_comedy',
        group: true,
      }),
    )

    const out = await expectRecordedRecommendation(fixture, {
      attendees: ['dono', 'lorenzo'],
      count: 100,
    })
    expect(out.vetoes.map((v) => v.target)).toEqual([
      'silly_comedy',
      'Q1054574',
    ])
  })

  test('Ajustes, a Declarado on an entity and a Relato on a film', async () => {
    const fixture = useFixture()
    await fixture.ok(
      personAdjust({ person: 'bruno', link: 'cast', level: 'low' }),
    )
    await fixture.ok(
      personAdjust({ person: 'bruno', link: 'writer', level: 'high' }),
    )
    await fixture.ok(
      personAdjust({ person: 'bruno', link: 'director', level: 'none' }),
    )
    await fixture.ok(
      personState({
        person: 'bruno',
        text: 'adoro o Davi Couto',
        target: 'Q9001803',
        reaction: 'like',
      }),
    )
    await fixture.ok(personCreate({ name: 'Ana', slug: 'ana' }))
    await fixture.ok(
      personReport({
        person: 'ana',
        text: 'ama O Farol',
        target: 'tt9000101',
        reaction: 'love',
      }),
    )
    await fixture.ok(
      personState({
        person: 'ana',
        text: 'odeia Barulho',
        target: 'tt9000501',
        reaction: 'hate',
      }),
    )
    await fixture.ok(rebuild)

    await expectRecordedRecommendation(fixture, {
      attendees: ['dono', 'ana'],
      count: 100,
    })
  })

  test('the cut of the strongest, and a link left out of the weights', async () => {
    const fixture = useFixture()
    const cut = weightsWith(
      fixture,
      '\nmax_evidence = 5\n',
      '\nmax_evidence = 1\n',
    )
    await expectRecordedRecommendation(
      fixture,
      { attendees: ['dono'], count: 100 },
      cut,
    )
    const noWriter = weightsWith(fixture, '\nwriter = 0.8\n', '\n')
    await expectRecordedRecommendation(
      fixture,
      { attendees: ['dono'], count: 100 },
      noWriter,
    )
  })

  test('the satisfaction, its line and the order it changes', async () => {
    const fixture = useFixture()
    const noImdbBonus = weightsWith(
      fixture,
      '\nweight = 0.3\n\n[no_sad]',
      '\nweight = 0.0\n\n[no_sad]',
    )
    const opened = await fixture.ok(
      recommendSession({ attendees: ['dono', 'quim'], count: 50 }),
      noImdbBonus,
    )
    await fixture.ok(
      recordFeedback({
        session: opened.session.id,
        film: 'Pequenos Milagres',
        ratings: ['dono=1', 'quim=5'],
      }),
    )

    const out = await expectRecordedRecommendation(
      fixture,
      { attendees: ['dono', 'quim'], count: 50 },
      noImdbBonus,
    )
    expect([out.satisfaction, out.disagreement]).toEqual([
      { bruno: 0.1111, quim: 1 },
      0.8889,
    ])
    expect(
      out.films.some((f) => f.filmLines.some((l) => l.person === 'bruno')),
    ).toBe(true)
    // A Relato in the Feedback, and the satisfaction outside the default Regra.
    await fixture.ok(rebuild)
    const again = await fixture.ok(
      recommendSession({ attendees: ['dono', 'quim', 'iara'], count: 5 }),
    )
    await fixture.ok(
      recordFeedback({
        session: again.session.id,
        film: 'Voo Noturno',
        reports: ['iara=não gostou'],
        ratings: ['dono=4', 'quim=5'],
      }),
    )
    await expectRecordedRecommendation(
      fixture,
      { attendees: ['dono', 'iara'], count: 30 },
      noImdbBonus,
    )
    await expectRecordedRecommendation(
      fixture,
      { attendees: ['dono', 'iara'], rule: 'average', count: 30 },
      noImdbBonus,
    )
  })
})
