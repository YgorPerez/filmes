// `tests/test_parecido.py`: "algo igual X" (`similar`, #67). Only the
// `[similar] candidates` most similar to the reference pass, counted before
// the other Restrições and the minimum rating; among them the Regra orders.
// The films are the fixture's `tt90067NN` (see its LEIAME). The rebuild's
// precomputed tables (`tags_no_catalogo`, `normas_tags_movielens`) come with
// the rebuild's port; the hooks a refazer uses are in `hooks.test.ts`.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Effect } from 'effect'
import { describe, expect, test } from 'vite-plus/test'
import {
  constraintLabel,
  readConstraints,
  recommend,
  storedConstraints,
  type Recommendation,
  type Vars,
} from '../../../src/index.ts'
import { useFixture, type Fixture } from '../../fixture.ts'
import {
  expectRecordedRecommendation,
  engineRecommendation,
  film,
  weightsWith,
  withoutPosterWarning,
} from '../support.ts'

const WRITING_LETTERS = 'tt9006701' // in the genome, the tags and the neighbours
const DOWN_THE_ROAD = 'tt9006702' // not in the genome
const SUNDAY_TABLE = 'tt9006711'
const DRAFT = 'tt9006712'
const ON_THE_ROAD = 'tt9006713'
const ALMOST_THE_SAME = 'tt9006714' // rated 6.5: below the minimum
const INK_AND_PAPER = 'tt9006716' // not in the genome, the reference's tags
const STARTING_POINT = 'tt9006720' // only director, cast and genre
const SAME_CAST = 'tt9006721' // the reference's first 3 actors, nothing else
const SAME_DIRECTOR = 'tt9006722' // the reference's director

const ids = (out: Recommendation): string[] => out.films.map((f) => f.id)

const similarTo = (
  fixture: Fixture,
  similar: ReadonlyArray<string>,
  count?: number,
  vars?: Vars,
) =>
  engineRecommendation(
    fixture,
    { attendees: ['dono'], similar, ...(count !== undefined && { count }) },
    vars,
  )

const similarLines = (out: Recommendation, id: string): string[] =>
  (out.films.find((f) => f.id === id)?.filmLines ?? [])
    .map((line) => line.text)
    .filter((text) => text.startsWith('parecido com'))

const candidates = (fixture: Fixture, n: number) =>
  weightsWith(fixture, '\ncandidates = 50\n', `\ncandidates = ${n}\n`)

test('only the similar ones come, and the Regra orders them', async () => {
  const out = await similarTo(useFixture(), [WRITING_LETTERS], 10)

  // None has a Fato for Bruno: the votes order, not the similarity (Ink and
  // Paper is the most similar and comes last). Almost the Same is below the
  // minimum rating.
  expect(ids(out)).toEqual([SUNDAY_TABLE, ON_THE_ROAD, DRAFT, INK_AND_PAPER])
  expect(out.constraints['similar']).toEqual({
    films: [WRITING_LETTERS],
    titles: ['Escrever Cartas'],
    removed: 83,
  })
})

test('cuts at the most similar, counted before the minimum rating, and warns', async () => {
  // The 3 most similar to Writing Letters: Ink and Paper, Sunday Table and
  // Almost the Same, below the minimum. Its place does not go to Draft.
  const fixture = useFixture()
  const out = await similarTo(
    fixture,
    [WRITING_LETTERS],
    undefined,
    candidates(fixture, 3),
  )

  expect(ids(out)).toEqual([SUNDAY_TABLE, INK_AND_PAPER])
  expect(ids(out)).not.toContain(ALMOST_THE_SAME)
  expect(withoutPosterWarning(out.warnings)).toContain(
    'só 2 parecidos com Escrever Cartas passaram nas Restrições',
  )
})

test('a single one passing says so in the singular', async () => {
  const fixture = useFixture()
  const out = await engineRecommendation(
    fixture,
    { attendees: ['dono'], similar: [WRITING_LETTERS], count: 3 },
    candidates(fixture, 1),
  )

  expect(withoutPosterWarning(out.warnings)).toContain(
    'só 1 parecido com Escrever Cartas passou nas Restrições',
  )
})

test('a missing source spreads its weight', async () => {
  // Ink and Paper is not in the genome, but has the reference's tags and
  // genres: without the genome in the pair, it is the most similar of all.
  const fixture = useFixture()
  const out = await similarTo(
    fixture,
    [WRITING_LETTERS],
    undefined,
    candidates(fixture, 1),
  )

  expect(ids(out)).toEqual([INK_AND_PAPER])
})

test('a reference outside the genome is compared by the other sources', async () => {
  const out = await similarTo(useFixture(), [DOWN_THE_ROAD])

  expect(ids(out)).toEqual([ON_THE_ROAD])
  expect(out.films[0]?.filmLines[0]?.text).toBe(
    'parecido com Estrada Afora: road trip',
  )
})

test('the similar line names the themes in common and is no Evidence', async () => {
  const out = await similarTo(useFixture(), [WRITING_LETTERS], 10)

  const sunday = film(out, 'Mesa de Domingo')
  const [line, ...more] = sunday.filmLines.filter((l) =>
    l.text.startsWith('parecido com'),
  )
  expect(more).toEqual([])
  expect(line).toMatchObject({
    text:
      'parecido com Escrever Cartas: family, writers, bittersweet; ' +
      'de 500 pessoas que deram 4+ a ele, 40% deram 4+ a este',
    person: null,
    contribution: 0,
  })
  expect(sunday.evidence['bruno']?.map((e) => e.text)).toEqual(['sem fato'])
  expect(sunday.onlyGuesses).toBe(true)
})

test('two references bring the similar ones of each', async () => {
  const out = await similarTo(
    useFixture(),
    [WRITING_LETTERS, DOWN_THE_ROAD],
    10,
  )

  expect(ids(out)).not.toContain(WRITING_LETTERS)
  expect(ids(out)).not.toContain(DOWN_THE_ROAD)
  expect(similarLines(out, ON_THE_ROAD)).toEqual([
    'parecido com Escrever Cartas: de 500 pessoas que deram 4+ a ele, 10% deram 4+ a este',
    'parecido com Estrada Afora: road trip',
  ])
  expect(ids(out)).toEqual(
    expect.arrayContaining([SUNDAY_TABLE, INK_AND_PAPER]),
  )
})

test('a reference never comes in', async () => {
  const out = await similarTo(useFixture(), [WRITING_LETTERS, SUNDAY_TABLE], 10)

  expect(ids(out)).not.toContain(SUNDAY_TABLE)
  expect(ids(out)).toContain(INK_AND_PAPER)
})

test('a reference outside the Catálogo is invalid usage', async () => {
  const outcome = await useFixture().run(
    recommend({ attendees: ['dono'], similar: ['tt0000001'] }),
  )

  expect(outcome).toEqual({
    exitCode: 2,
    output: {
      error: {
        code: 'invalid_usage',
        message: '--parecido tt0000001: filme fora do Catálogo',
      },
    },
  })
})

test('similar writes no taste', async () => {
  const fixture = useFixture()
  const folder = join(fixture.data, 'people')
  const read = () =>
    Object.fromEntries(
      readdirSync(folder).map((name) => [
        name,
        readFileSync(join(folder, name), 'utf8'),
      ]),
    )
  const before = read()

  await similarTo(fixture, [WRITING_LETTERS])

  expect(read()).toEqual(before)
})

test('three actors in common, alone, do not make a film similar', async () => {
  const out = await similarTo(useFixture(), [STARTING_POINT], 10)

  expect(ids(out)).not.toContain(SAME_CAST)
  expect(ids(out)).toContain(SAME_DIRECTOR)
})

test('the line for the director says "mesmo diretor" and cites Wikidata', async () => {
  const out = await similarTo(useFixture(), [STARTING_POINT], 10)

  const [line] = film(out, 'Mesma Diretora').filmLines.filter((l) =>
    l.text.startsWith('parecido com'),
  )
  expect(line).toMatchObject({
    text: 'parecido com Ponto de Partida: mesmo diretor',
    source: 'Wikidata',
    date: '2026-11-20',
  })
})

describe('reading the request', () => {
  const read = (
    fixture: Fixture,
    request: Parameters<typeof readConstraints>[0],
  ) => fixture.run(readConstraints(request))

  test('ids split on commas, stripped, without repeats', async () => {
    const asked = await Effect.runPromise(
      readConstraints({ similar: [' tt1, tt2', 'tt1,,', ' '] }),
    )

    expect(
      asked.filter((c) => c.name === 'similar').map((c) => c.toJson()),
    ).toEqual([{ films: ['tt1', 'tt2'], titles: [] }])
  })

  test('no id is no request', async () => {
    const asked = await Effect.runPromise(readConstraints({ similar: [' , '] }))
    expect(asked.filter((c) => c.name === 'similar')).toEqual([])
  })

  test('--sem-parecido holds only with --sessao, and not with --parecido', async () => {
    const fixture = useFixture()
    expect(await read(fixture, { noSimilar: true })).toMatchObject({
      exitCode: 2,
      output: {
        error: {
          message:
            '--sem-parecido só vale com --sessao: tira o parecido que a Sessão trazia',
        },
      },
    })
    expect(
      await read(fixture, { noSimilar: true, session: 's', similar: ['tt1'] }),
    ).toMatchObject({
      exitCode: 2,
      output: {
        error: { message: '--parecido e --sem-parecido juntos: escolha um' },
      },
    })
    // With a Session, the out-of-session Restrição turns on by itself (#95);
    // the Série na ordem is on in any request (#165).
    const alone = await read(fixture, { noSimilar: true, session: 's' })
    expect(alone.exitCode).toBe(0)
    expect(
      (alone.output as ReadonlyArray<{ name: string }>).map((c) => c.name),
    ).toEqual(['out_of_session', 'series_order'])
  })
})

describe('the card header', () => {
  test('reads the stored titles, else the ids', () => {
    expect(
      constraintLabel({
        name: 'similar',
        films: [WRITING_LETTERS],
        titles: ['Escrever Cartas'],
      }),
    ).toBe('parecidos com Escrever Cartas')
    expect(
      constraintLabel({
        name: 'similar',
        films: ['tt1', 'tt2', 'tt3'],
        titles: [],
      }),
    ).toBe('parecidos com tt1, tt2 e tt3')
  })

  test('the Session stores the references with their titles', async () => {
    const fixture = useFixture()
    const asked = await Effect.runPromise(
      readConstraints({ similar: [WRITING_LETTERS, DOWN_THE_ROAD] }),
    )
    await fixture.ok(recommend({ attendees: ['dono'], constraints: asked }))

    const stored = storedConstraints(asked)
    expect(stored).toEqual([
      {
        name: 'similar',
        films: [WRITING_LETTERS, DOWN_THE_ROAD],
        titles: ['Escrever Cartas', 'Estrada Afora'],
      },
    ])
    expect(stored.map((c) => constraintLabel(c))).toEqual([
      'parecidos com Escrever Cartas e Estrada Afora',
    ])
  })
})

describe('the whole output, as recorded', () => {
  test.each([
    [[WRITING_LETTERS]],
    [[DOWN_THE_ROAD]],
    [[WRITING_LETTERS, DOWN_THE_ROAD]],
    [[STARTING_POINT]],
    [[`${WRITING_LETTERS},${SUNDAY_TABLE}`]],
  ])('similar to %j', async (similar) => {
    await expectRecordedRecommendation(useFixture(), {
      attendees: ['dono'],
      count: 10,
      similar,
    })
  })

  test('the cut and its warning', async () => {
    const fixture = useFixture()
    const weights = candidates(fixture, 3)
    await expectRecordedRecommendation(
      fixture,
      { attendees: ['dono'], similar: [WRITING_LETTERS], noSlow: true },
      weights,
    )
  })
})
