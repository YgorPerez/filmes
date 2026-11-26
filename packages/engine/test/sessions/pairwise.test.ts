// Perguntas par a par [pairwise questions] (#181): a Presente answers "which
// of the two did you like more?" through the Link da Sessão. The pairs come
// from the films she has no Já visto for, by the entropy of their MovieLens
// ratings times the log of how many there are (Rashid et al. 2002), then by
// IMDb votes; the answers wait in the Session until the Dono records them
// (the chosen film a weak Nota, the other a Já visto) or discards them.

import { describe, expect, test } from 'vite-plus/test'
import {
  answerPairwise,
  consult,
  decidePairwise,
  pairwiseAnswers,
  pairwiseQuestions,
  personRate,
  rebuild,
  recommend,
  recommendSession,
  recordFeedback,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'
import { weightsWith } from '../recommendation/support.ts'

const open = async (fixture: Fixture) =>
  (
    await fixture.ok(
      recommendSession({ attendees: ['dono', 'teo', 'quim'], count: 2 }),
      {},
      { owner: 'bruno' },
    )
  ).session.id

const ids = (pairs: ReadonlyArray<readonly [{ id: string }, { id: string }]>) =>
  pairs.map(([a, b]) => [a.id, b.id])

const rows = async (fixture: Fixture, sql: string) =>
  (await fixture.ok(consult(sql))).rows

describe('pairwiseQuestions', () => {
  test('asks about the most informative films the Presente has not seen, adults never', async () => {
    const fixture = useFixture()
    const session = await open(fixture)

    const teo = await fixture.ok(pairwiseQuestions({ session, person: 'teo' }))
    expect(teo.answered).toBe(0)
    expect(await fixture.ok(pairwiseAnswers(session))).toEqual([])
    // `[pairwise] pairs` of `config/weights.toml`.
    expect(teo.pairs).toHaveLength(10)
    expect(ids(teo.pairs).slice(0, 4)).toEqual([
      ['tt9000201', 'tt9000101'],
      ['tt9000702', 'tt9000105'],
      ['tt9000601', 'tt9000202'],
      // Past the MovieLens films, by IMDb votes.
      ['tt9000701', 'tt9000103'],
    ])
    const asked = ids(teo.pairs).flat()
    expect(new Set(asked).size).toBe(asked.length)
    expect(asked).not.toContain('tt9000301')
    expect(teo.pairs[0]![0]).toEqual({
      id: 'tt9000201',
      title: 'Ponte Aérea',
      year: 2016,
    })

    const quim = await fixture.ok(
      pairwiseQuestions({ session, person: 'quim' }),
    )
    expect(ids(quim.pairs)[0]).toEqual(['tt9000101', 'tt9000702'])
    for (const seen of ['tt9000201', 'tt9000102', 'tt9000501', 'tt9000401'])
      expect(ids(quim.pairs).flat()).not.toContain(seen)
  })

  test('asks as many pairs as `[pairwise] pairs` says', async () => {
    const fixture = useFixture()
    const session = await open(fixture)

    const teo = await fixture.ok(
      pairwiseQuestions({ session, person: 'teo' }),
      weightsWith(fixture, 'pairs = 10', 'pairs = 3'),
    )
    expect(ids(teo.pairs)).toEqual([
      ['tt9000201', 'tt9000101'],
      ['tt9000702', 'tt9000105'],
      ['tt9000601', 'tt9000202'],
    ])
  })
})

describe('pairwiseQuestions', () => {
  test('only for a Presente with fewer Notas than `min_ratings`: a guest or someone new', async () => {
    const fixture = useFixture()
    const session = await open(fixture)
    const fewer = weightsWith(fixture, 'min_ratings = 20', 'min_ratings = 5')
    const asked = async (person: string) =>
      (await fixture.ok(pairwiseQuestions({ session, person }), fewer)).pairs

    // Bruno has 11 Notas, his own scale; Quim has 4 and Teo none.
    expect(await asked('bruno')).toEqual([])
    expect(await asked('quim')).toHaveLength(10)
    expect(await asked('teo')).toHaveLength(10)
  })

  test('only for a Presente of an open Session', async () => {
    const fixture = useFixture()
    const session = await open(fixture)

    const stranger = await fixture.run(
      pairwiseQuestions({ session, person: 'vera' }),
    )
    expect(stranger.exitCode).not.toBe(0)

    await fixture.ok(
      recordFeedback({ session, film: null }),
      {},
      { owner: 'bruno' },
    )
    const closed = await fixture.run(
      pairwiseQuestions({ session, person: 'teo' }),
    )
    expect(closed.output).toMatchObject({ error: { code: 'closed_session' } })
  })
})

describe('answerPairwise', () => {
  test('keeps each answer in the Session and moves to the next pair', async () => {
    const fixture = useFixture()
    const session = await open(fixture)

    expect(
      await fixture.ok(
        answerPairwise({
          session,
          person: 'teo',
          films: ['tt9000201', 'tt9000101'],
          choice: 'tt9000101',
        }),
      ),
    ).toEqual({ answered: 1 })
    await fixture.ok(
      answerPairwise({
        session,
        person: 'teo',
        films: ['tt9000702', 'tt9000105'],
        choice: null,
      }),
    )

    const next = await fixture.ok(pairwiseQuestions({ session, person: 'teo' }))
    expect(next.answered).toBe(2)
    expect(next.pairs).toHaveLength(10 - 2)
    expect(ids(next.pairs)[0]).toEqual(['tt9000601', 'tt9000202'])
    // Another Presente's questions do not move.
    const quim = await fixture.ok(
      pairwiseQuestions({ session, person: 'quim' }),
    )
    expect(quim.answered).toBe(0)
    // Nothing is taste yet: no Nota, no Já visto.
    expect(
      await rows(
        fixture,
        "SELECT filme_id FROM ja_vistos WHERE pessoa = 'teo'",
      ),
    ).toEqual([])
  })
})

describe('answerPairwise', () => {
  test('refuses a pair it did not ask and a choice outside the pair', async () => {
    const fixture = useFixture()
    const session = await open(fixture)
    const answer = (films: readonly [string, string], choice: string | null) =>
      fixture.run(answerPairwise({ session, person: 'teo', films, choice }))

    for (const refused of [
      await answer(['tt9000201', 'tt9000702'], 'tt9000201'),
      await answer(['tt9000201', 'tt9000101'], 'tt9000702'),
    ])
      expect(refused.output).toMatchObject({
        error: { code: 'invalid_usage' },
      })
    expect((await answer(['tt9000101', 'tt9000201'], null)).exitCode).toBe(0)
    expect(
      (await answer(['tt9000201', 'tt9000101'], 'tt9000201')).output,
    ).toMatchObject({ error: { code: 'invalid_usage' } })
  })
})

/** A Session where Teo answered three pairs and Quim one. */
const answered = async (fixture: Fixture) => {
  const session = await open(fixture)
  for (const [films, choice] of [
    [['tt9000201', 'tt9000101'], 'tt9000101'],
    [['tt9000702', 'tt9000105'], null],
    [['tt9000601', 'tt9000202'], 'tt9000601'],
  ] as const)
    await fixture.ok(answerPairwise({ session, person: 'teo', films, choice }))
  await fixture.ok(
    answerPairwise({
      session,
      person: 'quim',
      films: ['tt9000101', 'tt9000702'],
      choice: 'tt9000702',
    }),
  )
  return session
}

/** The Dono records Teo's answers. */
const decideTeo = (fixture: Fixture, session: string) =>
  fixture.ok(
    decidePairwise({ session, person: 'teo', record: true }),
    {},
    { owner: 'bruno' },
  )

describe('decidePairwise', () => {
  test('lists the answers that wait for the Dono, by Presente', async () => {
    const fixture = useFixture()
    const session = await answered(fixture)

    expect(await fixture.ok(pairwiseAnswers(session))).toEqual([
      {
        person: 'teo',
        name: 'Teo',
        answers: [
          {
            chosen: { id: 'tt9000101', title: 'O Farol de Areia', year: 2012 },
            other: { id: 'tt9000201', title: 'Ponte Aérea', year: 2016 },
          },
          {
            chosen: { id: 'tt9000601', title: 'Pequenos Milagres', year: 2019 },
            other: { id: 'tt9000202', title: 'O Último Bonde', year: 2019 },
          },
        ],
      },
      {
        person: 'quim',
        name: 'Quim',
        answers: [
          {
            chosen: { id: 'tt9000702', title: 'A Última Estação', year: 2018 },
            other: { id: 'tt9000101', title: 'O Farol de Areia', year: 2012 },
          },
        ],
      },
    ])
  })
})

describe('decidePairwise', () => {
  test("the Dono's yes makes the chosen film a weak Nota and the other a Já visto", async () => {
    const fixture = useFixture()
    const session = await answered(fixture)
    // Rated meanwhile: her own Nota stays the one that counts.
    await fixture.ok(
      personRate({
        person: 'teo',
        ratings: [{ film: 'tt9000202', rating: 10 }],
      }),
    )

    expect(await decideTeo(fixture, session)).toEqual({
      person: 'teo',
      added: 3,
    })
    const source = `perguntas par a par ${session}`
    expect(
      await rows(
        fixture,
        `SELECT j.filme_id, n.nota, j.fonte FROM ja_vistos j
         LEFT JOIN notas n ON n.fato_id = j.fato_id
         WHERE j.pessoa = 'teo' ORDER BY j.filme_id`,
      ),
    ).toEqual([
      ['tt9000101', 3.5, source],
      ['tt9000201', null, source],
      ['tt9000202', 5, 'notas no site'],
      ['tt9000601', 3.5, source],
    ])
    // Only Quim's answers still wait; Teo's count as asked.
    expect(
      (await fixture.ok(pairwiseAnswers(session))).map((a) => a.person),
    ).toEqual(['quim'])
    expect(
      (await fixture.ok(pairwiseQuestions({ session, person: 'teo' })))
        .answered,
    ).toBe(3)
    // Nothing waits any more: deciding again writes nothing.
    expect(await decideTeo(fixture, session)).toEqual({
      person: 'teo',
      added: 0,
    })

    // The Nota reaches other films with weak Força, through the director.
    // (The answered films themselves carry the Já visto, strong against.)
    const { films } = await fixture.ok(
      recommend({ attendees: ['teo'], count: 50 }),
    )
    const fromAnswers = films.flatMap((film) =>
      (film.evidence['teo'] ?? []).filter(
        (e) => e.source === source && e.contribution > 0,
      ),
    )
    expect(fromAnswers.length).toBeGreaterThan(0)
    for (const evidence of fromAnswers) expect(evidence.strength).toBe('weak')
  })
})

describe('decidePairwise', () => {
  test('a Nota from an answer stays weak in favour, whatever its percentile', async () => {
    const fixture = useFixture()
    const session = await answered(fixture)
    // Six low Notas: on her own scale (minimum 5), a 3,5 is her top 20%,
    // moderate in favour; an answer only says which of two she liked more.
    await fixture.ok(
      personRate({
        person: 'teo',
        ratings: [
          { film: 'tt9000301', rating: 2 },
          { film: 'tt9000302', rating: 2 },
          { film: 'tt9000303', rating: 3 },
          { film: 'tt9000401', rating: 3 },
          { film: 'tt9000402', rating: 4 },
          { film: 'tt9000403', rating: 4 },
        ],
      }),
    )
    await decideTeo(fixture, session)
    // From her file: the Nota keeps its mark, whatever the Fonte says.
    await fixture.ok(rebuild)

    const source = `perguntas par a par ${session}`
    const { films } = await fixture.ok(
      recommend({ attendees: ['teo'], count: 50 }),
      weightsWith(fixture, 'min_ratings = 20', 'min_ratings = 5'),
    )
    const evidence = films.flatMap((film) => film.evidence['teo'] ?? [])
    // The seeds on other films; the answered films carry the Já visto.
    const seeds = evidence.filter(
      (e) => e.source === source && e.text !== 'já viu',
    )
    expect(seeds.length).toBeGreaterThan(0)
    for (const seed of seeds) {
      expect(seed.strength).toBe('weak')
      expect(seed.contribution).toBeGreaterThan(0)
    }
    // Nor is it a Nota alta for the aggregated metadata: those lines name
    // her own top Notas, never an answered film.
    const high = evidence.filter((e) => e.text.includes('nota alta'))
    expect(high.length).toBeGreaterThan(0)
    for (const line of high) {
      expect(line.text).not.toContain('O Farol de Areia')
      expect(line.text).not.toContain('Pequenos Milagres')
    }
  })
})

describe('decidePairwise', () => {
  test('a Nota from an answer stays out of her scale: her other Notas read the same', async () => {
    const fixture = useFixture()
    const session = await answered(fixture)
    // Six Notas of her own (minimum 5): her 3 is her median, weak in
    // favour. The two answers' 3,5 would put it at her 37th percentile,
    // against the film.
    await fixture.ok(
      personRate({
        person: 'teo',
        ratings: [
          { film: 'tt9000301', rating: 4 },
          { film: 'tt9000302', rating: 4 },
          { film: 'tt9000303', rating: 6 },
          { film: 'tt9000401', rating: 6 },
          { film: 'tt9000402', rating: 8 },
          { film: 'tt9000403', rating: 8 },
        ],
      }),
    )
    await decideTeo(fixture, session)

    const { films } = await fixture.ok(
      recommend({ attendees: ['teo'], count: 50 }),
      weightsWith(fixture, 'min_ratings = 20', 'min_ratings = 5'),
    )
    const threes = films.flatMap((film) =>
      (film.evidence['teo'] ?? []).filter((e) => e.text.startsWith('deu 3 a')),
    )
    expect(threes.length).toBeGreaterThan(0)
    for (const seed of threes) {
      expect(seed.strength).toBe('weak')
      expect(seed.contribution).toBeGreaterThan(0)
    }
  })
})

describe('decidePairwise', () => {
  test('a Nota from an answer decays with age, like any Nota', async () => {
    const fixture = useFixture()
    const session = await answered(fixture)
    await decideTeo(fixture, session)

    const source = `perguntas par a par ${session}`
    const seeds = async (today?: string) =>
      new Map(
        (
          await fixture.ok(
            recommend({ attendees: ['teo'], count: 50 }),
            today === undefined ? {} : { FILMES_HOJE: today },
          )
        ).films.flatMap((film) =>
          (film.evidence['teo'] ?? [])
            .filter((e) => e.source === source && e.contribution > 0)
            .map((e) => [`${film.id} ${e.text}`, e] as const),
        ),
      )
    const now = await seeds()
    const later = await seeds('2036-11-20')
    expect(now.size).toBeGreaterThan(0)
    for (const [key, evidence] of now) {
      const aged = later.get(key)
      expect(aged?.strength).toBe('weak')
      expect(aged!.contribution).toBeLessThan(evidence.contribution)
    }
  })

  test("the Dono's no drops the answers and writes no taste", async () => {
    const fixture = useFixture()
    const session = await answered(fixture)

    expect(
      await fixture.ok(
        decidePairwise({ session, person: 'quim', record: false }),
        {},
        { owner: 'bruno' },
      ),
    ).toEqual({ person: 'quim', added: 0 })
    expect(
      (await fixture.ok(pairwiseAnswers(session))).map((a) => a.person),
    ).toEqual(['teo'])
    expect(
      await rows(
        fixture,
        "SELECT filme_id FROM ja_vistos WHERE pessoa = 'quim' AND fonte LIKE 'perguntas%'",
      ),
    ).toEqual([])
  })
})
