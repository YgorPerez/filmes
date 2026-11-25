// The Crédito (ticket #96); the pytest twin is tests/test_credito.py. Who
// fell behind in recent Sessions weighs more in the default Regra.
//
// For each group Session with Feedback, the gap is the Presentes' average
// reaction minus the Pessoa's, from 0 to 1 (a Nota n is (n − 0,5) / 4,5; a
// Relato gostou 1, neutro 0,5, não gostou 0). The Crédito is the average of
// those gaps over the 5 latest Sessions she shared with someone here today,
// floored at 0. In the default Regra, u' = u − 0,5 × Crédito.
//
// In the fixture Quim gave 5 to Ponte Aérea, 3,5 to Maré Baixa, 4,5 to
// Barulho and 2 to Fronteira. With Bruno:
// - As Horas Lentas pleases Bruno a lot and Quim little; Voo Noturno
//   pleases both the same, less than As Horas Lentas pleases Bruno.
// - Asfalto Quente pleases Quim and not Bruno; A Volta do Mar pleases Bruno
//   and Quim little.
//
// Not here yet: the film that rises only by an on-demand Restrição
// (`--gatilho`, #92).

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import {
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
 * the Crédito: the margins here are small, so only the Crédito moves it. */
const useCreditFixture = (): { fixture: Fixture; vars: Vars } => {
  const fixture = useFixture()
  const vars = weightsWith(
    fixture,
    '\npeso = 0.3\n\n[sem_tristeza]',
    '\npeso = 0.0\n\n[sem_tristeza]',
  ).engine
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

describe('the Crédito', () => {
  test('who fell behind gets Crédito, and her film rises with the Crédito line', async () => {
    const { fixture, vars } = useCreditFixture()
    const before = await recommend(fixture, vars, DONO_QUIM)
    expect(before.credit).toEqual({ bruno: 0, quim: 0 })
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

    // Reactions 0,111 and 1; average 0,556. Bruno fell 0,444 behind; Quim,
    // ahead, loses nothing.
    expect(after.credit).toEqual({ bruno: 0.4444, quim: 0 })
    expect(titles(after).indexOf('As Horas Lentas')).toBeLessThan(
      titles(after).indexOf('Voo Noturno'),
    )
    const [line] = film(after, 'As Horas Lentas').filmLines
    expect(line).toEqual({
      person: 'bruno',
      text: 'na Sessão de 2026-11-20 (Pequenos Milagres), Bruno deu 1 e a média dos Presentes foi 3',
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

  test('a film that rose but where who has Crédito is the minimum gets no line', async () => {
    // O Farol de Areia pleases Bruno (0,784) a bit more than Quim (0,574).
    // With the Crédito Bruno becomes its minimum (0,562): it rises only
    // because others fell more, and it is not Bruno's film.
    const { fixture, vars } = useCreditFixture()
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

  test('the Dono’s Relato counts in three levels', async () => {
    const { fixture, vars } = useCreditFixture()
    await withFeedback(fixture, vars, ['dono', 'quim'], {
      ratings: ['dono=5'],
      reports: ['quim=não gostou'],
    })

    const out = await recommend(fixture, vars, DONO_QUIM)

    // Reactions 1 and 0: average 0,5, and Quim fell 0,5 behind. An
    // average of 0,5 is 2,75 on the Nota scale.
    expect(out.credit).toEqual({ bruno: 0, quim: 0.5 })
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
      'na Sessão de 2026-11-20 (Pequenos Milagres), Quim não gostou e a média dos Presentes foi 2,8',
    )
  })

  test('the Crédito leaves alone the neutral of who has no Fato', async () => {
    // Quim gets Crédito 0,5 (u' = u − 0,25). On Voo Noturno he has a Fato
    // and falls to 0,407. On Maré Cheia he has none and counts 0,5.
    const { fixture, vars } = useCreditFixture()
    await withFeedback(fixture, vars, ['dono', 'quim'], {
      ratings: ['dono=5'],
      reports: ['quim=não gostou'],
    })

    const out = await recommend(fixture, vars, DONO_QUIM)

    expect(out.credit['quim']).toBe(0.5)
    expect(titles(out).indexOf('Maré Cheia')).toBeLessThan(
      titles(out).indexOf('Voo Noturno'),
    )
  })

  test('without Crédito the film of who fell behind comes later', async () => {
    const { fixture, vars } = useCreditFixture()

    const out = await recommend(fixture, vars, DONO_QUIM)

    expect(titles(out).indexOf('A Volta do Mar')).toBeLessThan(
      titles(out).indexOf('Asfalto Quente'),
    )
  })

  test('a Presente with no reaction is not in the Crédito', async () => {
    const { fixture, vars } = useCreditFixture()
    await withFeedback(fixture, vars, ['dono', 'quim'], { ratings: ['dono=1'] })

    expect(
      (await recommend(fixture, vars, { attendees: ['dono', 'quim'] })).credit,
    ).toEqual({ bruno: 0, quim: 0 })
  })

  test('"não vimos nada" leaves the Crédito alone', async () => {
    const { fixture, vars } = useCreditFixture()
    const { session } = await recommend(fixture, vars, {
      attendees: ['dono', 'quim'],
    })
    await fixture.ok(recordFeedback({ session: session.id, film: null }), vars)

    expect(
      (await recommend(fixture, vars, { attendees: ['dono', 'quim'] })).credit,
    ).toEqual({ bruno: 0, quim: 0 })
  })

  test('an open Session is not in the Crédito', async () => {
    const { fixture, vars } = useCreditFixture()
    await recommend(fixture, vars, { attendees: ['dono', 'quim'] })

    const out = await recommend(
      fixture,
      { ...vars, FILMES_HOJE: '2026-11-21' },
      { attendees: ['dono', 'quim'] },
    )
    expect(out.credit).toEqual({ bruno: 0, quim: 0 })
  })

  test('the average Regra and "de fulano" use no Crédito', async () => {
    const { fixture, vars } = useCreditFixture()
    await withFeedback(fixture, vars, ['dono', 'quim'], {
      ratings: ['dono=1', 'quim=5'],
    })

    for (const rule of [
      { rule: 'average' as const },
      { rule: 'by' as const, by: 'quim' },
    ]) {
      const out = await recommend(fixture, vars, { ...DONO_QUIM, ...rule })
      expect(out.credit).toEqual({})
      const lines = out.films.flatMap((f) => f.filmLines)
      expect(lines.length).toBeGreaterThan(0)
      expect(lines.every((l) => l.person === null)).toBe(true)
    }
  })

  test('the Dono alone has no Crédito', async () => {
    const { fixture, vars } = useCreditFixture()
    await withFeedback(fixture, vars, ['dono', 'quim'], {
      ratings: ['dono=1', 'quim=5'],
    })

    expect(
      (await recommend(fixture, vars, { attendees: ['dono'] })).credit,
    ).toEqual({})
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

describe('the Crédito’s window', () => {
  test('looks at the 5 latest Sessions with someone here today', async () => {
    const { fixture, vars } = useCreditFixture()
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
    await fixture.ok(reloadSessions)

    const credit = async (attendees: string[]) =>
      (await recommend(fixture, vars, { attendees })).credit
    expect(await credit(['dono', 'quim'])).toEqual({ bruno: 0, quim: 0 })
    expect(await credit(['dono', 'iara'])).toEqual({ bruno: 0.5, iara: 0 })
    // With the three, the 5 latest Bruno shared with Quim or Iara count.
    expect((await credit(['dono', 'quim', 'iara']))['bruno']).toBe(0.1)
  })

  test('cuts the window by the numeric suffixes on the same day', async () => {
    const { fixture, vars } = useCreditFixture()
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
      (await recommend(fixture, vars, { attendees: ['dono', 'quim'] })).credit,
    ).toEqual({ bruno: 0.1, quim: 0 })
  })
})

describe('regenerating with the Crédito', () => {
  const creditLines = (f: Recommendation['films'][number]) =>
    f.filmLines.filter((line) => line.text.startsWith('na Sessão de'))

  test('only the free places compete, and a kept film gets no Crédito line', async () => {
    // With Bruno's Crédito, As Horas Lentas goes past Ruído Branco and Voo
    // Noturno. Version 1, by Quim's taste, showed Casa Cheia and Explosão
    // Final on top; kept there, As Horas Lentas takes the first free place
    // (3), which without the Crédito would be Ruído Branco's.
    const { fixture, vars } = useCreditFixture()
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
    expect(creditLines(third).map((line) => line.person)).toEqual(['bruno'])

    const keepingWhatRose = await recommend(fixture, vars, {
      attendees: ['dono', 'quim'],
      session,
      keep: [third.id],
    })

    const kept = keepingWhatRose.films.filter((f) => !f.new)
    expect(kept.map((f) => f.title)).toEqual(['As Horas Lentas'])
    expect(creditLines(kept[0]!)).toEqual([])
  })
})
