// Satisfação replaces the Crédito (ticket #176, map #169). Whoever left the
// recent shared Sessions less satisfied weighs more in the default Regra.
//
// A reaction goes from 0 to 1 (a Nota n is (n − 0,5) / 4,5; a Relato gostou
// 1, neutro 0,5, não gostou 0). Each Presente's satisfaction is the mean of
// her reactions over the 5 latest group Sessions she shared with someone
// here today. The disagreement is the highest satisfaction minus the
// lowest. In the default Regra, u' = u − 0,25 × (highest − hers): with two
// Presentes, the same as the Crédito's u − 0,5 × (average − hers).
//
// In the fixture Quim gave 5 to Ponte Aérea, 3,5 to Maré Baixa, 4,5 to
// Barulho and 2 to Fronteira. With Bruno:
// - As Horas Lentas pleases Bruno a lot and Quim little; Voo Noturno
//   pleases both the same, less than As Horas Lentas pleases Bruno.
// - Asfalto Quente pleases Quim and not Bruno; A Volta do Mar pleases Bruno
//   and Quim little.

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import {
  satisfactionNow,
  recommendSession,
  recordFeedback,
  reloadSessions,
  type FeedbackRequest,
  type Recommendation,
  type RecommendSessionRequest,
  type Vars,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'
import { weightsWith } from '../recommendation/support.ts'

/** The IMDb bonus of As Horas Lentas (7,4) would change the order without
 * the satisfaction, and so would the Decaimento of the Notas (#173): the
 * margins here are small, so only the satisfaction moves it. A floor of 1
 * keeps every Nota at its full weight. */
const useSatisfactionFixture = (): { fixture: Fixture; vars: Vars } => {
  const fixture = useFixture()
  const vars = weightsWith(
    fixture,
    '\nweight = 0.3\n\n[no_sad]',
    '\nweight = 0.0\n\n[no_sad]',
    [['floor = 0.25', 'floor = 1.0']],
  )
  return { fixture, vars }
}

const recommend = async (
  fixture: Fixture,
  vars: Vars,
  request: RecommendSessionRequest,
): Promise<Recommendation & { session: { id: string } }> =>
  JSON.parse(
    JSON.stringify(await fixture.ok(recommendSession(request), vars)),
  ) as Recommendation & { session: { id: string } }

const titles = (out: Recommendation) => out.films.map((f) => f.title)

const film = (out: Recommendation, title: string) => {
  const found = out.films.filter((f) => f.title === title)
  expect(found).toHaveLength(1)
  return found[0]!
}

const DONO_QUIM = { attendees: ['dono', 'quim'], count: 50 }

const withFeedback = async (
  fixture: Fixture,
  vars: Vars,
  attendees: string[],
  reaction: Omit<FeedbackRequest, 'session' | 'film'>,
  chosen = 'Pequenos Milagres',
) => {
  const { session } = await recommend(fixture, vars, { attendees })
  await fixture.ok(
    recordFeedback({ session: session.id, film: chosen, ...reaction }),
    vars,
  )
}

const LINE =
  'Bruno: 11% nas últimas Sessões (deu 2 de 10 a Pequenos Milagres); Quim, 100%'
/** Contar says it to the Dono who looks: she is "Você" (#346). */
const LINE_NOW =
  'Você: 11% nas últimas Sessões (deu 2 de 10 a Pequenos Milagres); Quim, 100%'

describe('the satisfaction', () => {
  test('the satisfaction now names the Session of who fell behind', async () => {
    const { fixture, vars } = useSatisfactionFixture()
    expect(await fixture.ok(satisfactionNow(['bruno', 'quim']), vars)).toEqual({
      people: [
        { person: 'bruno', satisfaction: null, line: null },
        { person: 'quim', satisfaction: null, line: null },
      ],
      disagreement: null,
    })
    await withFeedback(fixture, vars, ['dono', 'quim'], {
      ratings: ['dono=1', 'quim=5'],
    })

    expect(await fixture.ok(satisfactionNow(['bruno', 'quim']), vars)).toEqual({
      people: [
        { person: 'bruno', satisfaction: 0.1111, line: LINE_NOW },
        { person: 'quim', satisfaction: 1, line: null },
      ],
      disagreement: 0.8889,
    })
    // Alone, nobody is behind anybody.
    expect(await fixture.ok(satisfactionNow(['bruno']), vars)).toEqual({
      people: [{ person: 'bruno', satisfaction: null, line: null }],
      disagreement: null,
    })
  })
})

describe('the satisfaction now', () => {
  test('names the Dono who looks as "você" when she is the most satisfied', async () => {
    const { fixture, vars } = useSatisfactionFixture()
    await withFeedback(fixture, vars, ['dono', 'quim'], {
      ratings: ['dono=5', 'quim=1'],
    })

    const now = await fixture.ok(satisfactionNow(['bruno', 'quim']), vars)

    expect(now.people.map((p) => p.line)).toEqual([
      null,
      'Quim: 11% nas últimas Sessões (deu 2 de 10 a Pequenos Milagres); você, 100%',
    ])
  })
})

describe('the satisfaction', () => {
  test('who left less satisfied weighs more, and her film rises with the satisfaction line', async () => {
    const { fixture, vars } = useSatisfactionFixture()
    const before = await recommend(fixture, vars, DONO_QUIM)
    expect([before.satisfaction, before.disagreement]).toEqual([{}, null])
    expect(titles(before).indexOf('Voo Noturno')).toBeLessThan(
      titles(before).indexOf('As Horas Lentas'),
    )

    // Bruno hated Pequenos Milagres; Quim loved it.
    await fixture.ok(
      recordFeedback({
        session: before.session.id,
        film: 'Pequenos Milagres',
        ratings: ['dono=1', 'quim=5'],
      }),
      vars,
    )
    const after = await recommend(fixture, vars, DONO_QUIM)

    // Reactions 0,111 and 1: Bruno is 0,889 below Quim, who loses nothing.
    expect(after.satisfaction).toEqual({ bruno: 0.1111, quim: 1 })
    expect(after.disagreement).toBe(0.8889)
    expect(titles(after).indexOf('As Horas Lentas')).toBeLessThan(
      titles(after).indexOf('Voo Noturno'),
    )
    const [line] = film(after, 'As Horas Lentas').filmLines
    expect(line).toEqual({
      person: 'bruno',
      text: LINE,
      source: 'Feedback da Sessão 2026-11-20',
      date: '2026-11-20',
      strength: 'strong',
      kind: 'rating',
      factId: line?.factId,
      contribution: 0,
    })
    expect(line?.factId).toMatch(/^notas:/u)
    expect(film(after, 'Voo Noturno').filmLines).toEqual([])
    expect(film(before, 'As Horas Lentas').filmLines).toEqual([])
  })
})

describe('the satisfaction', () => {
  test("the line's Força reads her Nota on her own scale", async () => {
    // Bruno rates high: with his Feedback, 12 Notas, five of them a 4.
    // Below the config's 20, his 4 is read on the population: its 77th
    // percentile, moderate, strong as a Feedback. With min_ratings 10 it is
    // read on his own scale: his 46th, weak, moderate as a Feedback.
    const { fixture, vars } = useSatisfactionFixture()
    await withFeedback(fixture, vars, ['dono', 'quim'], {
      ratings: ['dono=4', 'quim=5'],
    })
    const strengths = async (weights: Vars) =>
      (await recommend(fixture, weights, DONO_QUIM)).films.flatMap((f) =>
        f.filmLines
          .filter(
            (l) =>
              l.person === 'bruno' && l.text.includes(' nas últimas Sessões ('),
          )
          .map((l) => l.strength),
      )

    const onPopulation = await strengths(vars)
    expect(onPopulation.length).toBeGreaterThan(0)
    expect(new Set(onPopulation)).toEqual(new Set(['strong']))
    // Written after the run above: it replaces the same weights file.
    const own = weightsWith(fixture, 'min_ratings = 20', 'min_ratings = 10', [
      ['\nweight = 0.3\n\n[no_sad]', '\nweight = 0.0\n\n[no_sad]'],
      ['floor = 0.25', 'floor = 1.0'],
    ])
    const onHisOwn = await strengths(own)
    expect(onHisOwn.length).toBeGreaterThan(0)
    expect(new Set(onHisOwn)).toEqual(new Set(['moderate']))
  })

  test('a film that rose but where who fell behind is the minimum gets no line', async () => {
    // O Farol de Areia pleases Bruno (0,784) a bit more than Quim (0,574).
    // Weighed by his satisfaction, Bruno becomes its minimum (0,562): it
    // rises only because others fell more, and it is not Bruno's film.
    const { fixture, vars } = useSatisfactionFixture()
    const before = await recommend(fixture, vars, DONO_QUIM)
    await fixture.ok(
      recordFeedback({
        session: before.session.id,
        film: 'Pequenos Milagres',
        ratings: ['dono=1', 'quim=5'],
      }),
      vars,
    )
    const after = await recommend(fixture, vars, DONO_QUIM)

    expect(titles(after).indexOf('O Farol de Areia')).toBeLessThan(
      titles(before).indexOf('O Farol de Areia'),
    )
    expect(film(after, 'O Farol de Areia').filmLines).toEqual([])
  })
})

describe('the satisfaction', () => {
  test('the Dono’s Relato counts in three levels', async () => {
    const { fixture, vars } = useSatisfactionFixture()
    await withFeedback(fixture, vars, ['dono', 'quim'], {
      ratings: ['dono=5'],
      reports: ['quim=não gostou'],
    })

    const out = await recommend(fixture, vars, DONO_QUIM)

    // Reactions 1 and 0: Quim is 1 below Bruno.
    expect(out.satisfaction).toEqual({ bruno: 1, quim: 0 })
    expect(out.disagreement).toBe(1)
    expect(titles(out).indexOf('Asfalto Quente')).toBeLessThan(
      titles(out).indexOf('A Volta do Mar'),
    )
    const [line] = film(out, 'Asfalto Quente').filmLines
    expect([line?.person, line?.source, line?.kind, line?.strength]).toEqual([
      'quim',
      'Feedback da Sessão 2026-11-20',
      'report',
      'strong',
    ])
    expect(line?.text).toBe(
      'Quim: 0% nas últimas Sessões (não gostou de Pequenos Milagres); Bruno, 100%',
    )
  })

  test('the satisfaction leaves alone the neutral of who has no Fato', async () => {
    // Quim is 1 below Bruno (u' = u − 0,25). On Voo Noturno he has a Fato
    // and falls to 0,407. On Maré Cheia he has none and counts 0,5.
    const { fixture, vars } = useSatisfactionFixture()
    await withFeedback(fixture, vars, ['dono', 'quim'], {
      ratings: ['dono=5'],
      reports: ['quim=não gostou'],
    })

    const out = await recommend(fixture, vars, DONO_QUIM)

    expect(out.satisfaction['quim']).toBe(0)
    expect(titles(out).indexOf('Maré Cheia')).toBeLessThan(
      titles(out).indexOf('Voo Noturno'),
    )
  })

  test('with nobody behind, the film of who fell behind comes later', async () => {
    const { fixture, vars } = useSatisfactionFixture()

    const out = await recommend(fixture, vars, DONO_QUIM)

    expect(titles(out).indexOf('A Volta do Mar')).toBeLessThan(
      titles(out).indexOf('Asfalto Quente'),
    )
  })
})

describe('the satisfaction', () => {
  test('a Presente with no reaction has no satisfaction, and nobody is behind', async () => {
    const { fixture, vars } = useSatisfactionFixture()
    await withFeedback(fixture, vars, ['dono', 'quim'], { ratings: ['dono=1'] })

    const out = await recommend(fixture, vars, DONO_QUIM)
    expect([out.satisfaction, out.disagreement]).toEqual([
      { bruno: 0.1111 },
      null,
    ])
    expect(out.films.flatMap((f) => f.filmLines)).not.toContainEqual(
      expect.objectContaining({ person: 'bruno' }),
    )
  })

  test('"não vimos nada" leaves the satisfaction alone', async () => {
    const { fixture, vars } = useSatisfactionFixture()
    const { session } = await recommend(fixture, vars, {
      attendees: ['dono', 'quim'],
    })
    await fixture.ok(recordFeedback({ session: session.id, film: null }), vars)

    const out = await recommend(fixture, vars, { attendees: ['dono', 'quim'] })
    expect([out.satisfaction, out.disagreement]).toEqual([{}, null])
  })

  test('an open Session is not in the satisfaction', async () => {
    const { fixture, vars } = useSatisfactionFixture()
    await recommend(fixture, vars, { attendees: ['dono', 'quim'] })

    const out = await recommend(
      fixture,
      { ...vars, FILMES_HOJE: '2026-11-21' },
      { attendees: ['dono', 'quim'] },
    )
    expect([out.satisfaction, out.disagreement]).toEqual([{}, null])
  })
})

describe('the satisfaction', () => {
  test('the average Regra and "de fulano" do not weigh the satisfaction', async () => {
    const { fixture, vars } = useSatisfactionFixture()
    await withFeedback(fixture, vars, ['dono', 'quim'], {
      ratings: ['dono=1', 'quim=5'],
    })

    for (const rule of [
      { rule: 'average' as const },
      { rule: 'by' as const, by: 'quim' },
    ]) {
      const out = await recommend(fixture, vars, { ...DONO_QUIM, ...rule })
      expect([out.satisfaction, out.disagreement]).toEqual([{}, null])
      const lines = out.films.flatMap((f) => f.filmLines)
      expect(lines.length).toBeGreaterThan(0)
      expect(lines.every((l) => l.person === null)).toBe(true)
    }
  })

  test('the Dono alone is behind nobody', async () => {
    const { fixture, vars } = useSatisfactionFixture()
    await withFeedback(fixture, vars, ['dono', 'quim'], {
      ratings: ['dono=1', 'quim=5'],
    })

    const out = await recommend(fixture, vars, { attendees: ['dono'] })
    expect([out.satisfaction, out.disagreement]).toEqual([{}, null])
  })
})

/** A Session written straight into filmes-dados, as the Feedback leaves
 * it. */
const writeSession = (
  fixture: Fixture,
  id: string,
  date: string,
  attendees: string[],
  ratings: Array<[string, number]>,
  chosen = 'tt9000601',
) => {
  mkdirSync(join(fixture.data, 'sessions'), { recursive: true })
  const lines = ratings
    .map(([p, n]) => `    - {person: ${p}, kind: rating, rating: ${n}}\n`)
    .join('')
  writeFileSync(
    join(fixture.data, 'sessions', `${id}.md`),
    `---\ndate: ${date}\nattendees: [${attendees.join(', ')}]\n` +
      'context: {request: null, max_duration: null, moods: [], constraints: []}\n' +
      `rule: {name: default}\nchosen: ${chosen}\nchosen_in_recommendation: null\n` +
      `feedback:\n  recorded_on: ${date}\n  reactions:\n${lines}` +
      'recommendation: []\n---\n## Recomendação\n',
  )
}

/** Bruno's Sessions with Quim, with Iara and alone, for the window. */
const writeWindowSessions = (fixture: Fixture) => {
  // With Quim: in the oldest Bruno fell behind; in the next 5, a tie.
  writeSession(
    fixture,
    '2026-10-01-quim',
    '2026-10-01',
    ['bruno', 'quim'],
    [
      ['bruno', 0.5],
      ['quim', 5],
    ],
  )
  for (let day = 2; day < 7; day++)
    writeSession(
      fixture,
      `2026-10-0${day}-quim`,
      `2026-10-0${day}`,
      ['bruno', 'quim'],
      [
        ['bruno', 4],
        ['quim', 4],
      ],
    )
  // With Iara, and alone: Bruno fell behind, but none of it is with Quim.
  writeSession(
    fixture,
    '2026-11-01-iara',
    '2026-11-01',
    ['bruno', 'iara'],
    [
      ['bruno', 0.5],
      ['iara', 5],
    ],
  )
  writeSession(
    fixture,
    '2026-11-02-bruno',
    '2026-11-02',
    ['bruno'],
    [['bruno', 0.5]],
  )
}

describe('the satisfaction’s window', () => {
  test('looks at the 5 latest Sessions with someone here today', async () => {
    const { fixture, vars } = useSatisfactionFixture()
    writeWindowSessions(fixture)
    await fixture.ok(reloadSessions)

    const measured = async (attendees: string[]) => {
      const out = await recommend(fixture, vars, { attendees })
      return [out.satisfaction, out.disagreement]
    }
    // A 4 is 0,778.
    expect(await measured(['dono', 'quim'])).toEqual([
      { bruno: 0.7778, quim: 0.7778 },
      0,
    ])
    expect(await measured(['dono', 'iara'])).toEqual([{ bruno: 0, iara: 1 }, 1])
    // With the three, each one's 5 latest shared with someone here: Bruno's
    // are the one with Iara and 4 ties with Quim; Quim's, the 5 ties.
    expect(await measured(['dono', 'quim', 'iara'])).toEqual([
      { bruno: 0.6222, quim: 0.7778, iara: 1 },
      0.3778,
    ])
  })

  test('cuts the window by the numeric suffixes on the same day', async () => {
    const { fixture, vars } = useSatisfactionFixture()
    const date = '2026-11-20'
    for (let n = 5; n < 10; n++)
      writeSession(
        fixture,
        `${date}-quim-${n}`,
        date,
        ['bruno', 'quim'],
        [
          ['bruno', 5],
          ['quim', 5],
        ],
      )
    writeSession(
      fixture,
      `${date}-quim-10`,
      date,
      ['bruno', 'quim'],
      [
        ['bruno', 0.5],
        ['quim', 5],
      ],
    )
    await fixture.ok(reloadSessions)

    expect(
      (await recommend(fixture, vars, { attendees: ['dono', 'quim'] }))
        .satisfaction,
    ).toEqual({ bruno: 0.8, quim: 1 })
  })
})

describe('regenerating with the satisfaction', () => {
  const satisfactionLines = (f: Recommendation['films'][number]) =>
    f.filmLines.filter((line) => line.text.includes('% nas últimas Sessões ('))

  test('only the free places compete, and a kept film gets no satisfaction line', async () => {
    // With Bruno behind, As Horas Lentas goes past Ruído Branco and Voo
    // Noturno. Version 1, by Quim's taste, showed Casa Cheia and Explosão
    // Final on top; kept there, As Horas Lentas takes the first free place
    // (3), which without the satisfaction would be Ruído Branco's.
    const { fixture, vars } = useSatisfactionFixture()
    await withFeedback(fixture, vars, ['dono', 'quim'], {
      ratings: ['dono=1', 'quim=5'],
    })
    const byQuim = await recommend(fixture, vars, {
      attendees: ['dono', 'quim'],
      rule: 'by',
      by: 'quim',
    })
    const session = byQuim.session.id
    expect(titles(byQuim).slice(0, 2)).toEqual(['Casa Cheia', 'Explosão Final'])

    const redone = await recommend(fixture, vars, {
      attendees: ['dono', 'quim'],
      session,
      keep: [
        byQuim.films
          .slice(0, 2)
          .map((f) => f.id)
          .join(','),
      ],
    })

    const third = redone.films[2]!
    expect([third.title, third.new]).toEqual(['As Horas Lentas', true])
    expect(satisfactionLines(third).map((line) => line.person)).toEqual([
      'bruno',
    ])

    const keepingWhatRose = await recommend(fixture, vars, {
      attendees: ['dono', 'quim'],
      session,
      keep: [third.id],
    })

    const kept = keepingWhatRose.films.filter((f) => !f.new)
    expect(kept.map((f) => f.title)).toEqual(['As Horas Lentas'])
    expect(satisfactionLines(kept[0]!)).toEqual([])
  })
})
