// `avaliar` (#103), the Vitest twin of tests/test_avaliar.py. Where Python
// rebuilt the database or pinned the dumps (`reconstruir`, `atualizar`,
// not ported here), the test runs the Python CLI for that setup step over
// the test's database (`python` from the recommendation support).
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs'
import { join } from 'node:path'
import { migrateConfigFile, outputToEnglish } from '@filmes/key-migration'
import { Effect } from 'effect'
import { parse } from 'yaml'
import { describe, expect, test } from 'vite-plus/test'
import {
  evaluate,
  importLetterboxd,
  openSessions,
  PyRandom,
  recommendSession,
  recordFeedback,
  type Evaluation,
  type EvaluationProgress,
} from '../../src/index.ts'
import { ROOT, useFixture, type Fixture } from '../fixture.ts'
import { zipOf } from '../imports/zip.ts'
import { PYTHON_TIMEOUT, pythonOk } from '../recommendation/support.ts'

const reports = (fixture: Fixture) => ({
  FILMES_AVALIACOES: join(fixture.root, 'avaliacoes'),
})

/** The result as an edge prints it. */
const evaluated = async (
  fixture: Fixture,
  vars: Record<string, string | undefined> = {},
  grid = false,
): Promise<Evaluation> =>
  JSON.parse(
    JSON.stringify(
      await fixture.ok(evaluate({ grid }), { ...reports(fixture), ...vars }),
    ),
  ) as Evaluation

describe('avaliar', () => {
  test('writes the results without opening a Session', async () => {
    const fixture = useFixture()
    const before = await fixture.ok(openSessions)
    const events: EvaluationProgress[] = []
    const result = await fixture.ok(
      evaluate({
        onProgress: (event) => Effect.sync(() => void events.push(event)),
      }),
      reports(fixture),
    )

    expect(await fixture.ok(openSessions)).toEqual(before)
    expect(result.offline.people.people).toBe(4)
    expect(result.offline.people.heldOut4Plus).toBe(5)
    expect(result.offline.movielens.people).toBe(0)
    expect(result.online.sessions).toBe(0)
    expect(result.priority).toBe('offline')
    expect(result.file).toBe(join(fixture.root, 'avaliacoes', '2026-11-20.md'))
    const text = readFileSync(result.file, 'utf8')
    for (const part of [
      'Recall@50',
      'Cobertura',
      'Pesos',
      'Versões dos dados',
      'notas.csv',
    ])
      expect(text).toContain(part)
    expect(result.warnings).toEqual([
      'A amostra offline do MovieLens exige ml-32m/ratings.csv e ml-32m/links.csv no Catálogo.',
    ])
    // Progress goes from 0 to 100, in order, with Python's messages.
    expect(events[0]).toEqual({
      progress: 0,
      total: 100,
      message: 'Lendo o Feedback e os diários',
    })
    expect(events.at(-1)).toEqual({
      progress: 100,
      total: 100,
      message: 'Relatório gravado',
    })
    const values = events.map((e) => e.progress)
    expect([...values].sort((a, b) => a - b)).toEqual(values)
  })

  test(
    'uses only the ten latest Sessions with Feedback',
    { timeout: 60_000 },
    async () => {
      const fixture = useFixture()
      const old = await fixture.ok(recommendSession({ attendees: ['dono'] }))
      await fixture.ok(
        recordFeedback({
          session: old.session.id,
          film: old.films[0]!.id,
          ratings: ['dono=0.5'],
        }),
      )
      for (let day = 21; day <= 30; day++) {
        const today = { FILMES_HOJE: `2026-11-${day}` }
        const session = await fixture.ok(
          recommendSession({ attendees: ['dono'], count: 6 }),
          today,
        )
        const id = session.session.id
        if (day === 21)
          await fixture.ok(recordFeedback({ session: id, film: null }), today)
        else
          await fixture.ok(
            recordFeedback({
              session: id,
              film: session.films[day === 22 ? 5 : 0]!.id,
              ratings: ['dono=5'],
            }),
            today,
          )
      }
      const last = { FILMES_HOJE: '2026-11-30' }
      await fixture.ok(recommendSession({ attendees: ['dono'] }), last)
      const result = await evaluated(fixture, last)
      expect(result.priority).toBe('online')
      // "Não vimos nada" counts in the window of 10, not in the rate's
      // denominator.
      expect(result.online).toEqual({
        sessions: 10,
        withFilm: 9,
        chosenTop5: 8,
        rateTop5: 8 / 9,
        reactions: 9,
        meanReaction: 1.0,
      })
    },
  )

  test(
    'leaves the sampled users out of the neighbourhood',
    { timeout: PYTHON_TIMEOUT },
    async () => {
      const fixture = useFixture()
      const catalog = join(fixture.root, 'catalogo')
      cpSync(join(ROOT, 'tests/fixture/catalogo'), catalog, { recursive: true })
      rmSync(join(catalog, 'genoma.csv'))
      for (let i = 0; i < 55; i++)
        // Rating 9: the IMDb rating bonus (#56) keeps them ahead of As Horas
        // Lentas (7.4).
        appendFileSync(
          join(catalog, 'filmes.csv'),
          `tt927${String(i).padStart(4, '0')},Filme popular ${i},2020,90,999999,9.0\n`,
        )
      const ml = join(catalog, 'ml-32m')
      mkdirSync(ml)
      writeFileSync(
        join(ml, 'links.csv'),
        'movieId,imdbId,tmdbId\n' +
          [1, 2, 3, 4, 5, 6]
            .map((i) => `${i},90010${String(i).padStart(2, '0')},${i}\n`)
            .join(''),
      )
      // The 30 users outside the sample only gave 4+ to films 1 and 3. Film
      // 2 enters the top 50 if the held-out ratings leak into the
      // neighbours.
      const users = Array.from({ length: 1030 }, (_, i) => i + 1)
      const drawn = new Set(new PyRandom(27).sample(users, 1000))
      const lines = ['userId,movieId,rating,timestamp']
      for (const user of users) {
        lines.push(`${user},1,5,1700000000`)
        if (drawn.has(user)) {
          for (const film of [4, 5, 6])
            lines.push(`${user},${film},2,1700000000`)
          lines.push(`${user},2,5,1700000001`)
        }
        lines.push(`${user},3,5,1700000002`)
      }
      writeFileSync(join(ml, 'ratings.csv'), lines.join('\n') + '\n')
      pythonOk(fixture, ['reconstruir'], { FILMES_CATALOGO: catalog })

      const result = await evaluated(fixture, { FILMES_CATALOGO: catalog })
      const sample = result.offline.movielens
      expect(sample.people).toBe(1000)
      expect(sample.retrieved).toBe(1000)
      expect(sample.heldOut4Plus).toBe(2000)
      expect(sample.coverageTop5).toBe(0)
      expect(sample.recall50).toBe(0.5)
      expect(result.versions).toHaveProperty(['ml-32m/ratings.csv'])
      expect(result.movielensSample).toEqual({ seed: 27, users: 1000 })
      expect(result.warnings).toEqual([])
    },
  )

  test(
    'the grid tries three values per weight and keeps the config',
    { timeout: 300_000 },
    async () => {
      const fixture = useFixture()
      const weights = join(fixture.root, 'weights.toml')
      cpSync(join(fixture.config, 'weights.toml'), weights)
      const before = readFileSync(weights)

      const result = await evaluated(fixture, { FILMES_PESOS: weights }, true)
      const grid = result.grid!
      const values = grid.values as Record<string, Record<string, unknown[]>>
      // 27 sets of multipliers; the five path weights vary one at a time (1
      // current set + 5 × 2 variations); the cut's N (3, 8 and 10 besides
      // 5) varies alone, with the rest as the config has it.
      expect(Object.keys(values['path.weight']!).sort()).toEqual([
        'cast',
        'director',
        'genre',
        'series',
        'writer',
      ])
      expect(grid.combinations).toBe(27 * 11 + 3)
      for (const section of ['path.weight', 'strength.multiplier'])
        for (const tried of Object.values(values[section]!))
          expect(tried).toHaveLength(3)
      expect(values['utility']).toEqual({ maxEvidence: [3, 5, 8, 10] })
      const best = grid.best as Array<{
        weights: { utility: Record<string, number> }
      }>
      expect(best).toHaveLength(3)
      for (const entry of best)
        expect(entry.weights.utility).toHaveProperty('maxEvidence')
      expect(readFileSync(weights)).toEqual(before)
      expect(await fixture.ok(openSessions)).toEqual({ sessions: [] })
      expect(readFileSync(result.file, 'utf8')).toContain('## Grade de pesos')
    },
  )

  test('uses the diary dates when the export has loose ratings', async () => {
    const fixture = useFixture()
    const olga = join(ROOT, 'tests/fixture/letterboxd/olga')
    const content = zipOf(
      ['ratings.csv', 'diary.csv', 'watched.csv'].map(
        (name) => [name, readFileSync(join(olga, name))] as const,
      ),
    )
    await fixture.ok(
      importLetterboxd({
        person: 'teo',
        original: 'letterboxd.zip',
        content,
        author: { name: 'Dono', email: 'dono@example.org' },
      }),
    )

    const result = (await evaluated(fixture)).offline.people
    // The latest loose rating got 5. In the diary the latest is Maré Baixa,
    // which got 2 and counts only in the coverage.
    expect(result.people).toBe(5)
    expect(result.filmsTop5).toBe(25)
    expect(result.heldOut4Plus).toBe(5)
  })

  test(
    'the report keeps the manifest of the pinned Catalog',
    { timeout: PYTHON_TIMEOUT },
    async () => {
      const fixture = useFixture()
      const catalog = join(fixture.root, 'catalogo')
      const versions = join(fixture.root, 'versoes.json')
      const pinned = pythonOk(fixture, ['atualizar'], {
        FILMES_CATALOGO: catalog,
        FILMES_VERSOES: versions,
        FILMES_GRAVACOES: join(ROOT, 'tests/fixture/gravacoes'),
      }) as { dumps: Record<string, { sha256: string }> }
      pythonOk(fixture, ['reconstruir'], {
        FILMES_CATALOGO: catalog,
        FILMES_VERSOES: versions,
      })
      const english = migrateConfigFile(
        'versoes-catalogo.json',
        readFileSync(versions, 'utf8'),
        'to-en',
      )
      const versionsEn = join(fixture.root, 'catalog-versions.json')
      writeFileSync(versionsEn, english!.text)

      const result = await evaluated(fixture, {
        FILMES_CATALOGO: catalog,
        FILMES_VERSOES: versionsEn,
      })

      const manifest = result.versions['manifest'] as { dumps: unknown }
      expect(manifest.dumps).toEqual(
        (outputToEnglish('atualizar', pinned) as { dumps: unknown }).dumps,
      )
      expect(readFileSync(result.file, 'utf8')).toContain(
        pinned.dumps['title.basics.tsv.gz']!.sha256,
      )
    },
  )

  test('a missing MovieLens file is invalid data; no report folder is missing_config', async () => {
    const fixture = useFixture()
    const catalog = join(fixture.root, 'catalogo')
    cpSync(join(ROOT, 'tests/fixture/catalogo'), catalog, { recursive: true })
    mkdirSync(join(catalog, 'ml-32m'))
    writeFileSync(
      join(catalog, 'ml-32m', 'links.csv'),
      'movieId,imdbId,tmdbId\n',
    )
    const halfDump = await fixture.run(evaluate(), {
      ...reports(fixture),
      FILMES_CATALOGO: catalog,
    })
    expect(halfDump).toEqual({
      exitCode: 1,
      output: {
        error: {
          code: 'invalid_data',
          message: `${join(catalog, 'ml-32m')}: são necessários ratings.csv e links.csv para avaliar o MovieLens`,
        },
      },
    })
    const noFolder = await fixture.run(evaluate(), {
      FILMES_AVALIACOES: undefined,
    })
    expect(noFolder.exitCode).toBe(1)
    expect(noFolder.output).toMatchObject({ error: { code: 'missing_config' } })
  })
})

/** The report's YAML blocks, parsed, and the text around them. */
const splitReport = (text: string) => {
  const blocks: unknown[] = []
  const prose = text.replace(/```yaml\n([\s\S]*?)```/g, (_, yaml: string) => {
    blocks.push(parse(yaml, { version: '1.1' }))
    return '```yaml\n<bloco>\n```'
  })
  return { prose, blocks }
}

describe('avaliar, against Python', () => {
  const both = async (
    fixture: Fixture,
    grid: boolean,
    vars: Record<string, string> = {},
  ) => {
    const pyReports = join(fixture.root, 'py-avaliacoes')
    const python = outputToEnglish(
      'avaliar',
      pythonOk(fixture, ['avaliar', ...(grid ? ['--grade'] : [])], {
        FILMES_AVALIACOES: pyReports,
        ...vars,
      }),
    ) as Record<string, unknown>
    const engine = await evaluated(fixture, vars, grid)
    return {
      python,
      engine,
      pyReport: readFileSync(String(python['file']), 'utf8'),
    }
  }

  test(
    'gives the same result and the same report',
    { timeout: PYTHON_TIMEOUT },
    async () => {
      const fixture = useFixture()
      const { python, engine, pyReport } = await both(fixture, false)
      const { file: _py, ...pythonRest } = python
      const { file, ...engineRest } = engine
      expect(engineRest).toEqual(pythonRest)

      const ours = splitReport(readFileSync(file, 'utf8'))
      const theirs = splitReport(pyReport)
      expect(ours.prose).toBe(theirs.prose)
      // Python dumped its Portuguese dict; the report now holds the output's
      // English sections.
      const [weights, versions] = theirs.blocks
      const english = outputToEnglish('avaliar', {
        pesos: weights,
        versoes: versions,
      }) as Record<string, unknown>
      expect(ours.blocks).toEqual([english['weights'], english['versions']])
    },
  )

  test(
    'the grid gives the same best weights and report',
    { timeout: 600_000 },
    async () => {
      const fixture = useFixture()
      const { python, engine, pyReport } = await both(fixture, true)
      const { file: _py, ...pythonRest } = python
      const { file, ...engineRest } = engine
      expect(engineRest).toEqual(pythonRest)
      const ours = splitReport(readFileSync(file, 'utf8'))
      const theirs = splitReport(pyReport)
      expect(ours.prose).toBe(theirs.prose)
      const english = outputToEnglish('avaliar', {
        grade: { melhores: theirs.blocks[2] },
      }) as {
        grid: { best: unknown }
      }
      expect(ours.blocks[2]).toEqual(english.grid.best)
    },
  )
})
