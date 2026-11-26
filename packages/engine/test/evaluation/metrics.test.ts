// The metrics `evaluate` gained in #171: Força calibration, the predicted
// rating's error, the top 5's similarity, and satisfaction and disagreement.
import { appendFileSync, cpSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import {
  evaluate,
  rebuild,
  recommendSession,
  recordFeedback,
  type Evaluation,
} from '../../src/index.ts'
import { ROOT, useFixture, type Fixture } from '../fixture.ts'
import { weightsWith } from '../recommendation/support.ts'

const evaluated = async (
  fixture: Fixture,
  vars: Record<string, string | undefined> = {},
): Promise<Evaluation> =>
  JSON.parse(
    JSON.stringify(
      await fixture.ok(evaluate(), {
        FILMES_AVALIACOES: join(fixture.root, 'avaliacoes'),
        ...vars,
      }),
    ),
  ) as Evaluation

/** The fixture's Catálogo with lines added to some tables, rebuilt. */
const withCatalog = async (
  fixture: Fixture,
  added: Readonly<Record<string, ReadonlyArray<string>>>,
  edit: (catalog: string) => void = () => {},
) => {
  const catalog = join(fixture.root, 'catalogo')
  cpSync(join(ROOT, 'tests/fixture/catalogo'), catalog, { recursive: true })
  edit(catalog)
  for (const [table, lines] of Object.entries(added))
    appendFileSync(join(catalog, `${table}.csv`), lines.join('\n') + '\n')
  await fixture.ok(rebuild, { FILMES_CATALOGO: catalog })
  return { FILMES_CATALOGO: catalog }
}

const withRatings = (fixture: Fixture, lines: ReadonlyArray<string>) =>
  withCatalog(fixture, { notas: lines })

describe('evaluate: Força calibration', () => {
  test('counts the held-out Notas by the strongest Força in favour', async () => {
    const fixture = useFixture()
    const calibration = (await evaluated(fixture)).offline.people.calibration
    // Bruno's three newest films are held out: O Farol de Areia (5) and
    // O Último Bonde (4), each with a 4,5 of the same director before the
    // cut (strong), and Barulho (1), with only a 2 of its director (nothing
    // in favour). One Força alone says nothing about rising.
    expect(calibration.people['bruno']).toEqual({
      weak: { heldOut: 0, hits: 0, hitRate: null },
      moderate: { heldOut: 0, hits: 0, hitRate: null },
      strong: { heldOut: 2, hits: 2, hitRate: 1 },
      none: { heldOut: 1, hits: 0, hitRate: 0 },
      rises: null,
    })
    expect(calibration.overall.rises).not.toBe(false)
  })

  test('flags a Força that hits less often than a weaker one', async () => {
    const fixture = useFixture()
    // Held out now: As Horas Lentas (1) and O Farol de Areia (5), strong
    // through the 4,5 to Maré Baixa, and Vento Norte (5), moderate through
    // the 4 to Jardim Suspenso.
    const vars = await withRatings(fixture, [
      'bruno,tt9000104,1.0,2025-07-01,Letterboxd do Bruno',
      'bruno,tt9000302,5.0,2025-07-02,Letterboxd do Bruno',
    ])
    const result = await evaluated(fixture, vars)
    const bruno = result.offline.people.calibration.people['bruno']!
    expect(bruno.moderate).toEqual({ heldOut: 1, hits: 1, hitRate: 1 })
    expect(bruno.strong).toEqual({ heldOut: 2, hits: 1, hitRate: 0.5 })
    expect(bruno.rises).toBe(false)
    expect(result.offline.people.calibration.overall.rises).toBe(false)
    expect(result.warnings).toContain(
      'Na amostra Pessoas, a Força não sobe de fraca para forte: uma Força acerta menos que outra mais fraca.',
    )
    expect(readReport(result)).toContain(
      '| bruno | — (0/0) | 100.0% (1/1) | 50.0% (1/2) | — (0/0) | não |',
    )
  })
})

const readReport = (result: Evaluation) => readFileSync(result.file, 'utf8')

describe('evaluate: predicted-rating error', () => {
  test('is absent when no held-out film has a predicted rating', async () => {
    const fixture = useFixture()
    const result = await evaluated(fixture)
    for (const sample of [result.offline.people, result.offline.movielens])
      expect(sample.predictedRatingError).toEqual({
        films: 0,
        meanAbsoluteError: null,
        rawMeanAbsoluteError: null,
      })
    expect(readReport(result)).toContain(
      '- Erro médio (Pessoas): ausente, nenhum filme retido tem Nota prevista.',
    )
  })

  test("compares the taste neighbours' prediction with the held-out Nota", async () => {
    const fixture = useFixture()
    // Before his cut, Bruno shares 5 films with users 10, 20 and 30 of the
    // sample and with user 40, who rates the other way round; the 3
    // closest are the first three. They predict O Farol de Areia (his 5,
    // a 10) at 8,31, O Último Bonde (4, an 8) at 6,04 and Barulho (1, a 2)
    // at 3,06, all on the population's scale. Quim keeps 3 Notas, which
    // users 40, 20 and 10 share; they disagree on Ponte Aérea (his 5, a
    // 10) and predict 6,87. That is before the calibration (#210): on
    // Bruno's 5 training films they are harsher than he is, and with 5
    // films against 20 they become 6,21, 3,20 and 8,71; Quim, whose 3
    // Notas each leave 2 films shared when left out, has nothing to fit.
    const weights = readFileSync(join(ROOT, 'config/weights.toml'), 'utf8')
    const file = join(fixture.root, 'weights-test.toml')
    writeFileSync(
      file,
      weights.replace('k = 50\nmin_shared = 10', 'k = 3\nmin_shared = 3'),
    )
    const result = await evaluated(fixture, { FILMES_PESOS: file })

    const error = result.offline.people.predictedRatingError
    expect(error.films).toBe(4)
    expect(error.rawMeanAbsoluteError).toBeCloseTo(
      (1.69 + 1.96 + 1.06 + 3.13) / 4,
      2,
    )
    expect(error.meanAbsoluteError).toBeCloseTo(
      (1.79 + 1.2 + 1.29 + 3.13) / 4,
      2,
    )
    expect(readReport(result)).toMatch(
      /- Erro médio \(Pessoas\): 1[.,]85 em 4 filmes, de 1 a 10; sem a Calibração, 1[.,]96\./,
    )
  })
})

describe('evaluate: predicted-rating error', () => {
  test('calibrates on the Notas before the cut only', async () => {
    const fixture = useFixture()
    // Quim alone. With all 4 of his Notas he has 4 comparable films and a
    // calibration of his own (test/recommendation/prediction-calibration
    // .test.ts); before his cut he keeps 3, and each one left out leaves 2
    // films shared, below the 3 the neighbours need. So the held-out Ponte
    // Aérea keeps the neighbours' 6,87, against his 10.
    const vars = await withCatalog(fixture, {}, (catalog) => {
      const notas = join(catalog, 'notas.csv')
      const lines = readFileSync(notas, 'utf8').split('\n')
      writeFileSync(
        notas,
        lines.filter((l, i) => i === 0 || l.startsWith('quim,')).join('\n') +
          '\n',
      )
    })
    const result = await evaluated(fixture, {
      ...vars,
      ...weightsWith(
        fixture,
        'k = 50\nmin_shared = 10',
        'k = 3\nmin_shared = 3',
      ),
    })

    const error = result.offline.people.predictedRatingError
    expect(error.films).toBe(1)
    expect(error.rawMeanAbsoluteError).toBeCloseTo(3.13, 2)
    expect(error.meanAbsoluteError).toBe(error.rawMeanAbsoluteError)
  })
})

describe('evaluate: similarity of the top 5', () => {
  test('is the mean similarity of each pair in the lists', async () => {
    const fixture = useFixture()
    // Bruno alone, with three 5s to a new director: her five other films,
    // which share nothing but the director, fill his top 5, and each pair
    // is as similar as can be.
    const films = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `tt901710${i}`)
    const vars = await withCatalog(
      fixture,
      {
        filmes: films.map((id, i) => `${id},Filme ${i},2020,90,999999,9.9`),
        entidades: ['Q9017101,Diretora do #171'],
        arestas: films.map(
          (id) => `${id},diretor,Q9017101,Wikidata,2026-11-20`,
        ),
        notas: films
          .slice(5)
          .map(
            (id, i) => `bruno,${id},5.0,2024-12-0${i + 1},Letterboxd do Bruno`,
          ),
      },
      (catalog) => {
        const notas = join(catalog, 'notas.csv')
        const lines = readFileSync(notas, 'utf8').split('\n')
        writeFileSync(
          notas,
          lines.filter((l, i) => i === 0 || l.startsWith('bruno,')).join('\n') +
            '\n',
        )
      },
    )
    const result = await evaluated(fixture, vars)
    expect(result.offline.people.people).toBe(1)
    expect(result.offline.people.similarityTop5).toBe(1)
    expect(result.offline.movielens.similarityTop5).toBeNull()
    expect(readReport(result)).toContain('Parecença média no top 5')
  })

  test('lies between 0 and 1 on the lists of the fixture', async () => {
    const fixture = useFixture()
    const result = await evaluated(fixture)
    const similarity = result.offline.people.similarityTop5!
    expect(similarity).toBeGreaterThan(0)
    expect(similarity).toBeLessThan(1)
  })
})

describe('evaluate: similarity of the top 5', () => {
  test('falls with MMR in the order, and Recall@50 stays (#177)', async () => {
    const fixture = useFixture()
    const before = await evaluated(fixture)
    const after = await evaluated(
      fixture,
      weightsWith(fixture, 'lambda = 1.0', 'lambda = 0.8'),
    )

    expect(after.offline.people.similarityTop5!).toBeLessThan(
      before.offline.people.similarityTop5!,
    )
    // MMR only reorders the first 30 films of the order: the top 50 keeps
    // the same films.
    expect(after.offline.people.recall50).toBe(before.offline.people.recall50)
  })
})

describe('evaluate: satisfaction and disagreement', () => {
  test('come from the reactions of the latest Sessions', async () => {
    const fixture = useFixture()
    const watched = async (day: number, ratings: ReadonlyArray<string>) => {
      const today = { FILMES_HOJE: `2026-11-${day}` }
      const attendees = ratings.map((r) => r.split('=')[0]!)
      const session = await fixture.ok(recommendSession({ attendees }), today)
      await fixture.ok(
        recordFeedback({
          session: session.session.id,
          film: session.films[0]!.id,
          ratings,
        }),
        today,
      )
    }
    // Reactions go from 0 to 1: a 5 is 1, a 0,5 is 0 and a 3 is 5/9.
    await watched(21, ['bruno=5', 'iara=0.5'])
    await watched(22, ['bruno=3', 'iara=5'])
    await watched(23, ['bruno=5'])

    const { satisfaction } = (
      await evaluated(fixture, { FILMES_HOJE: '2026-11-23' })
    ).online
    expect(satisfaction.people).toEqual({
      bruno: { sessions: 3, satisfaction: expect.closeTo((2 + 5 / 9) / 3) },
      iara: { sessions: 2, satisfaction: 0.5 },
    })
    // Only Sessions where two or more Presentes reacted: the lowest
    // reaction of each, and the highest minus the lowest.
    expect(satisfaction.groupSessions).toBe(2)
    expect(satisfaction.minimum).toBeCloseTo((0 + 5 / 9) / 2)
    expect(satisfaction.disagreement).toBeCloseTo((1 + 4 / 9) / 2)
  })

  test('are absent without a group Session', async () => {
    const fixture = useFixture()
    const result = await evaluated(fixture)
    expect(result.online.satisfaction).toEqual({
      people: {},
      groupSessions: 0,
      minimum: null,
      disagreement: null,
    })
    expect(readReport(result)).toContain('- Satisfação mínima: —')
  })
})
