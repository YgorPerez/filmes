// Escolha de grupo [group pick] (#415): before the Perguntas par a par, a
// Presente with few Notas picks, through the Link da Sessão, up to 3 groups
// of `config/film_groups.toml` that are most like her, or none. The answer
// waits in the Session with her pairwise answers; recorded, each group is
// an Escolha de grupo in her file, and its films are weak seeds of the
// MovieLens neighbourhood: no Nota, no Já visto.

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import {
  answerGroupPick,
  answerPairwise,
  consult,
  decidePairwise,
  deleteSession,
  groupPickQuestion,
  pairwiseAnswers,
  readFilmGroups,
  resolvePerson,
  rebuild,
  recommend,
  recommendSession,
  recordFeedback,
} from '../../src/index.ts'
import { useFixture, type Fixture } from '../fixture.ts'
import { weightsWith } from '../recommendation/support.ts'

/** Groups over the fixture's films: the repo's are real films, which the
 * fixture's Catálogo does not have. */
const GROUPS = `
[tides]
name = "Faróis e marés"
films = ["tt9000101", "tt9000103", "tt9000102"]
labels = ["litorâneo", "melancólico", "contemplativo"]

[noise]
name = "Barulho e fronteira"
films = ["tt9000303", "tt9000401", "tt9000501"]
labels = ["urbano", "tenso", "seco"]

[outside]
name = "Fora do Catálogo"
films = ["tt9000101", "tt0000001", "tt9000102"]
labels = ["um", "dois", "três"]
`

const withGroups = (fixture: Fixture, groups = GROUPS) =>
  writeFileSync(join(fixture.config, 'film_groups.toml'), groups)

const open = async (fixture: Fixture) =>
  (
    await fixture.ok(
      recommendSession({ attendees: ['dono', 'teo', 'quim'], count: 2 }),
      {},
      { owner: 'bruno' },
    )
  ).session.id

const rows = async (fixture: Fixture, sql: string) =>
  (await fixture.ok(consult(sql))).rows

const pick = (
  fixture: Fixture,
  session: string,
  person: string,
  groups: string[],
) => fixture.run(answerGroupPick({ session, person, groups }))

const record = (fixture: Fixture, session: string, person: string) =>
  fixture.ok(
    decidePairwise({ session, person, record: true }),
    {},
    { owner: 'bruno' },
  )

describe('readFilmGroups', () => {
  test('the repo has 12 to 16 groups, each with 3 films and 3 labels', async () => {
    const fixture = useFixture()
    const groups = await fixture.ok(readFilmGroups)
    expect(groups.length).toBeGreaterThanOrEqual(12)
    expect(groups.length).toBeLessThanOrEqual(16)
    for (const group of groups) {
      expect(group.films).toHaveLength(3)
      expect(group.labels).toHaveLength(3)
      for (const film of group.films) expect(film).toMatch(/^tt\d+$/)
    }
    const films = groups.flatMap((g) => g.films)
    expect(new Set(films).size).toBe(films.length)
  })

  test('a group without 3 films is invalid_config', async () => {
    const fixture = useFixture()
    withGroups(
      fixture,
      '[short]\nname = "Curto"\nfilms = ["tt9000101"]\nlabels = ["a", "b", "c"]\n',
    )
    const read = await fixture.run(readFilmGroups)
    expect(read.output).toMatchObject({ error: { code: 'invalid_config' } })
  })
})

describe('groupPickQuestion', () => {
  test('asks a Presente with few Notas, with the groups whose films are all in the Catálogo', async () => {
    const fixture = useFixture()
    withGroups(fixture)
    const session = await open(fixture)

    const teo = await fixture.ok(groupPickQuestion({ session, person: 'teo' }))
    expect(teo?.map((g) => g.id)).toEqual(['tides', 'noise'])
    expect(teo?.[0]).toEqual({
      id: 'tides',
      name: 'Faróis e marés',
      labels: ['litorâneo', 'melancólico', 'contemplativo'],
      films: [
        { id: 'tt9000101', title: 'O Farol de Areia', year: 2012 },
        { id: 'tt9000103', title: 'Cidade de Vidro', year: 2018 },
        { id: 'tt9000102', title: 'Maré Baixa', year: 2015 },
      ],
    })
    // Bruno has his own scale (11 Notas, minimum 5): he is not asked.
    expect(
      await fixture.ok(
        groupPickQuestion({ session, person: 'bruno' }),
        weightsWith(fixture, 'min_ratings = 20', 'min_ratings = 5'),
      ),
    ).toBeNull()
  })

  test("with the repo's groups, none of whose films the fixture has, nobody is asked", async () => {
    const fixture = useFixture()
    const session = await open(fixture)
    expect(
      await fixture.ok(groupPickQuestion({ session, person: 'teo' })),
    ).toBeNull()
  })

  test('only for a Presente of an open Session', async () => {
    const fixture = useFixture()
    withGroups(fixture)
    const session = await open(fixture)

    const stranger = await fixture.run(
      groupPickQuestion({ session, person: 'vera' }),
    )
    expect(stranger.output).toMatchObject({ error: { code: 'invalid_usage' } })
    await fixture.ok(
      recordFeedback({ session, film: null }),
      {},
      { owner: 'bruno' },
    )
    const closed = await fixture.run(
      groupPickQuestion({ session, person: 'teo' }),
    )
    expect(closed.output).toMatchObject({ error: { code: 'closed_session' } })
  })
})

describe('answerGroupPick', () => {
  test('keeps the answer in the Session once: nothing is taste yet', async () => {
    const fixture = useFixture()
    withGroups(fixture)
    const session = await open(fixture)

    expect((await pick(fixture, session, 'teo', ['noise', 'tides'])).output)
      .toEqual({ groups: ['noise', 'tides'] })
    expect(
      await fixture.ok(groupPickQuestion({ session, person: 'teo' })),
    ).toBeNull()
    // Asked once per Session.
    expect(
      (await pick(fixture, session, 'teo', ['tides'])).output,
    ).toMatchObject({ error: { code: 'invalid_usage' } })
    // Quim is still asked.
    expect(
      await fixture.ok(groupPickQuestion({ session, person: 'quim' })),
    ).not.toBeNull()
    const file = readFileSync(
      join(fixture.data, 'sessions', `${session}.md`),
      'utf8',
    )
    expect(file).toContain('group_picks:')
    expect(
      await rows(fixture, 'SELECT * FROM escolhas_de_grupo'),
    ).toEqual([])
  })

  test('refuses a group not asked, the same group twice and more than 3', async () => {
    const fixture = useFixture()
    withGroups(fixture, `${GROUPS}
[a]
name = "A"
films = ["tt9000201", "tt9000202", "tt9000203"]
labels = ["um", "dois", "três"]

[b]
name = "B"
films = ["tt9000601", "tt9000602", "tt9000603"]
labels = ["um", "dois", "três"]
`)
    const session = await open(fixture)

    for (const groups of [
      ['outside'],
      ['unknown'],
      ['tides', 'tides'],
      ['tides', 'noise', 'a', 'b'],
    ])
      expect(
        (await pick(fixture, session, 'teo', groups)).output,
      ).toMatchObject({ error: { code: 'invalid_usage' } })
    expect(
      (await pick(fixture, session, 'teo', ['tides', 'noise', 'a'])).exitCode,
    ).toBe(0)
  })

  test('"nenhum" answers the question and waits for nothing', async () => {
    const fixture = useFixture()
    withGroups(fixture)
    const session = await open(fixture)

    expect((await pick(fixture, session, 'teo', [])).exitCode).toBe(0)
    expect(
      await fixture.ok(groupPickQuestion({ session, person: 'teo' })),
    ).toBeNull()
    expect(await fixture.ok(pairwiseAnswers(session))).toEqual([])
  })
})

describe('decidePairwise', () => {
  test('lists the groups that wait with the pairwise answers', async () => {
    const fixture = useFixture()
    withGroups(fixture)
    const session = await open(fixture)
    await pick(fixture, session, 'quim', ['noise'])
    await fixture.ok(
      answerPairwise({
        session,
        person: 'teo',
        films: ['tt9000201', 'tt9000101'],
        choice: 'tt9000101',
      }),
    )

    const waiting = await fixture.ok(pairwiseAnswers(session))
    expect(waiting.map((w) => [w.person, w.groups.map((g) => g.id)])).toEqual(
      [
        ['quim', ['noise']],
        ['teo', []],
      ],
    )
    expect(waiting[0]?.answers).toEqual([])
    expect(waiting[0]?.groups[0]?.films.map((f) => f.title)).toEqual([
      'Rio Abaixo',
      'Fronteira',
      'Barulho',
    ])
  })

  test("the Dono's yes writes an Escolha de grupo: weak seeds, no Nota, no Já visto", async () => {
    const fixture = useFixture()
    withGroups(fixture)
    const session = await open(fixture)
    await pick(fixture, session, 'teo', ['tides'])

    expect(await record(fixture, session, 'teo')).toEqual({
      person: 'teo',
      added: 1,
    })
    const teo = await fixture.ok(resolvePerson('teo'))
    expect(teo.body).toContain(
      `## Escolhas de grupo\n\n- 2026-11-20 · escolha de grupo ${session} · Faróis e marés (tides) · tt9000101, tt9000103, tt9000102\n`,
    )
    expect(await fixture.ok(pairwiseAnswers(session))).toEqual([])
    // Asked no more, in this Session or the next.
    expect(
      await fixture.ok(groupPickQuestion({ session, person: 'teo' })),
    ).toBeNull()
    expect(
      await rows(
        fixture,
        "SELECT filme_id FROM ja_vistos WHERE pessoa = 'teo' UNION ALL SELECT filme_id FROM notas WHERE pessoa = 'teo'",
      ),
    ).toEqual([])

    // The same from her file.
    await fixture.ok(rebuild)
    expect(
      await rows(
        fixture,
        "SELECT grupo, rotulo, filme_id, ordem FROM escolhas_de_grupo WHERE pessoa = 'teo' ORDER BY ordem",
      ),
    ).toEqual([
      ['tides', 'Faróis e marés', 'tt9000101', 0],
      ['tides', 'Faróis e marés', 'tt9000103', 1],
      ['tides', 'Faróis e marés', 'tt9000102', 2],
    ])

    const { films } = await fixture.ok(
      recommend({ attendees: ['teo'], count: 50 }),
    )
    const house = films.find((f) => f.id === 'tt9001001')
    const line = house?.evidence['teo']?.find((e) =>
      e.text.startsWith('escolheu o grupo de'),
    )
    expect(line).toMatchObject({
      text: 'escolheu o grupo de O Farol de Areia, Cidade de Vidro e Maré Baixa; das 3.104 pessoas que deram 8 ou mais a O Farol de Areia (2012), 64% fizeram o mesmo com este',
      strength: 'weak',
      kind: 'review',
    })
    expect(line?.contribution).toBeGreaterThan(0)
    // The group's own films are no Já visto: still recommended.
    expect(films.map((f) => f.id)).toContain('tt9000101')
  })

  test('a film she has a Nota for seeds through her Nota, not the pick', async () => {
    const fixture = useFixture()
    withGroups(fixture)
    const session = await open(fixture)
    await pick(fixture, session, 'quim', ['tides'])
    await record(fixture, session, 'quim')

    const { films } = await fixture.ok(
      recommend({ attendees: ['quim'], count: 50 }),
    )
    const lines = films.flatMap((f) =>
      (f.evidence['quim'] ?? []).map((e) => e.text),
    )
    const picked = lines.filter((t) => t.startsWith('escolheu o grupo de'))
    expect(picked.length).toBeGreaterThan(0)
    // Quim gave Maré Baixa a Nota.
    for (const text of picked) expect(text).not.toContain('a Maré Baixa (2015)')
  })

  test("the Dono's no discards the groups: nothing in her file", async () => {
    const fixture = useFixture()
    withGroups(fixture)
    const session = await open(fixture)
    await pick(fixture, session, 'teo', ['tides', 'noise'])
    const before = await fixture.ok(resolvePerson('teo'))

    expect(
      await fixture.ok(
        decidePairwise({ session, person: 'teo', record: false }),
        {},
        { owner: 'bruno' },
      ),
    ).toEqual({ person: 'teo', added: 0 })
    expect((await fixture.ok(resolvePerson('teo'))).body).toBe(before.body)
    expect(await fixture.ok(pairwiseAnswers(session))).toEqual([])
    const file = readFileSync(
      join(fixture.data, 'sessions', `${session}.md`),
      'utf8',
    )
    expect(file).toContain('discarded_on')
  })

  test('deleting the Session, keeping the taste, discards the groups that wait', async () => {
    const fixture = useFixture()
    withGroups(fixture)
    const { session } = await fixture.ok(
      recommendSession({ attendees: ['bruno', 'quim'] }),
    )
    await pick(fixture, session.id, 'quim', ['noise'])
    await fixture.ok(
      recordFeedback({
        session: session.id,
        film: 'Pequenos Milagres',
        ratings: ['bruno=1', 'quim=5'],
      }),
    )
    await fixture.ok(
      deleteSession({ session: session.id, mode: 'keep_taste' }),
      {},
      { owner: 'bruno' },
    )
    const file = readFileSync(
      join(fixture.data, 'sessions', `${session.id}.md`),
      'utf8',
    )
    expect(file).toMatch(
      /group_picks:\n- person: quim\n {2}groups: \[noise\]\n {2}date: '2026-11-20'\n {2}discarded_on: '2026-11-20'\n/u,
    )
  })
})
