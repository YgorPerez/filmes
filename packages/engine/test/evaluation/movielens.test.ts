// The MovieLens sample and the diaries of `avaliar` on messy inputs: quoted
// and multi-line CSV fields, a BOM and CRLF endings, repeated ratings, tags,
// and the files it refuses (with their messages). Each case checks the
// whole outcome against the one recorded for it, which the Python engine
// gave on the same Catalog and database.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vite-plus/test'
import {
  dumpReportYaml,
  evaluate,
  importTrakt,
  rebuild,
  type Vars,
} from '../../src/index.ts'
import { ROOT, useFixture, type Fixture } from '../fixture.ts'
import { zipOf } from '../imports/zip.ts'
import { expectRecorded } from '../expected.ts'

/** Fixture films, so the sample's training reaches real Candidates. */
const FILMS = ['9000101', '9000102', '9000103', '9000104', '9000105', '9000106']

/** A Catalog copy with `ml-32m/` holding `files`. */
const catalogWith = (
  fixture: Fixture,
  files: Record<string, string>,
): string => {
  const catalog = join(fixture.root, 'catalogo')
  cpSync(join(ROOT, 'tests/fixture/catalogo'), catalog, { recursive: true })
  mkdirSync(join(catalog, 'ml-32m'), { recursive: true })
  for (const [name, text] of Object.entries(files))
    writeFileSync(join(catalog, 'ml-32m', name), text)
  return catalog
}

/** The engine's outcome, without the report path, checked against the one
 * recorded for the test (`expected.ts`). */
const expectRecordedOutcome = async (fixture: Fixture, vars: Vars) => {
  const { exitCode, output } = await fixture.run(evaluate(), {
    ...vars,
    FILMES_AVALIACOES: join(fixture.root, 'avaliacoes'),
  })
  const shown = JSON.parse(JSON.stringify(output)) as Record<string, unknown>
  delete shown['file']
  const outcome = { exitCode, output: shown }
  expectRecorded(fixture, outcome)
  return outcome
}

const ratings = (rows: string[], header = 'userId,movieId,rating,timestamp') =>
  [header, ...rows].join('\n') + '\n'

const links =
  '﻿movieId,imdbId,tmdbId\r\n' +
  FILMS.map((f, i) => `${i + 1},${f},${i}\r\n`).join('') +
  '7,,7\r\n'

/** 1,100 users, so 100 stay out of the sample and feed the neighbours. */
const manyRatings = () => {
  const rows: string[] = []
  for (let user = 1; user <= 1100; user++)
    for (let film = 1; film <= 6; film++)
      if ((user + film) % 3 !== 0)
        rows.push(
          `${user},${film},${((user * film) % 5) + 1}${film % 2 ? '.5' : ''},${1_600_000_000 + user * 1000 + film * 7}`,
        )
  // A repeated rating: the later one wins, an earlier one is ignored.
  rows.push('5,1,1,1600005000', '5,1,5,1500000000')
  return ratings(rows)
}

// Users 14, 36, 41, 48, 55, 80 and 86 are outside `Random(27)`'s sample of
// 1,100, so their tags count; user 1 is in it, so hers do not.
const TAGS =
  'userId,movieId,tag,timestamp\n' +
  '1,1,"funny, dark",1\n' +
  '14,1,"says ""hi""",1\n' +
  '36,2,"two\nlines",1\n' +
  '41,3,"after"quote,1\n' +
  '48,3,  Slow  ,1\n' +
  '55,3,slow,1\n' +
  '80,9,unmapped,1\n' +
  '86,4,,1\n' +
  '92,3,SLOW,1\n'

describe('avaliar on MovieLens files, as recorded', () => {
  test('a messy sample with tags gives the same measures', async () => {
    const fixture = useFixture()
    const catalog = catalogWith(fixture, {
      'links.csv': links,
      'ratings.csv': manyRatings(),
      'tags.csv': TAGS,
    })
    const engine = await expectRecordedOutcome(fixture, {
      FILMES_CATALOGO: catalog,
    })
    expect(engine.exitCode).toBe(0)
  })

  test('a small sample warns that MovieLens had few users', async () => {
    const fixture = useFixture()
    const rows = [
      '1,1,5,100',
      '1,2,4,200',
      '1,3,2,300',
      '2,1,5,100',
      '2,2,"4.5",200',
      '3,1,5,100',
    ]
    // A last line with no line break, inside quotes: not strict, it stays.
    const catalog = catalogWith(fixture, {
      'links.csv': links,
      'ratings.csv': ratings(rows) + '4,4,5,"400',
    })
    const engine = await expectRecordedOutcome(fixture, {
      FILMES_CATALOGO: catalog,
    })
    expect(engine.exitCode).toBe(0)
    expect((engine.output['warnings'] as string[])[0]).toMatch(
      /^O MovieLens tinha só 4 usuários/,
    )
  })

  test.each([
    ['only links.csv', { 'links.csv': links }],
    ['a short row', { 'links.csv': links, 'ratings.csv': ratings(['1,1,5']) }],
    [
      'a blank row',
      { 'links.csv': links, 'ratings.csv': ratings(['1,1,5,1', '']) },
    ],
    [
      'a user that is not an int',
      { 'links.csv': links, 'ratings.csv': ratings(['x,1,5,1']) },
    ],
    [
      'a rating that is not a float',
      { 'links.csv': links, 'ratings.csv': ratings(['1,1,cinco,1']) },
    ],
    [
      'an instant that is not an int',
      { 'links.csv': links, 'ratings.csv': ratings(['1,1,5,1.5']) },
    ],
    [
      'a movieId that is not an int',
      { 'links.csv': 'movieId,imdbId\nx,1\n', 'ratings.csv': ratings([]) },
    ],
    [
      'a missing column',
      {
        'links.csv': links,
        'ratings.csv': ratings(['1,1,1'], 'userId,movieId,timestamp'),
      },
    ],
    [
      'a tag user that is not an int',
      {
        'links.csv': links,
        'ratings.csv': manyRatings(),
        'tags.csv': 'userId,movieId,tag\nx,1,a\n',
      },
    ],
  ])('%s is refused', async (_, files) => {
    const fixture = useFixture()
    const catalog = catalogWith(fixture, files)
    const engine = await expectRecordedOutcome(fixture, {
      FILMES_CATALOGO: catalog,
    })
    expect(engine.exitCode).toBe(1)
  })

  test('a manifest without the MovieLens dump is invalid_versions', async () => {
    const fixture = useFixture()
    const catalog = catalogWith(fixture, {
      'links.csv': links,
      'ratings.csv': manyRatings(),
    })
    const manifest = join(fixture.root, 'versoes.json')
    writeFileSync(manifest, JSON.stringify({ dumps: {} }))
    const engine = await expectRecordedOutcome(fixture, {
      FILMES_CATALOGO: catalog,
      FILMES_VERSOES: manifest,
    })
    expect(engine.output).toMatchObject({
      error: { code: 'invalid_versions' },
    })
    const missing = await fixture.run(evaluate(), {
      FILMES_CATALOGO: catalog,
      FILMES_VERSOES: join(fixture.root, 'none.json'),
      FILMES_AVALIACOES: join(fixture.root, 'avaliacoes'),
    })
    expect(missing.output).toEqual({
      error: {
        code: 'invalid_versions',
        message: `${join(fixture.root, 'none.json')}: sem fonte e data de ml-32m.zip ([Errno 2] No such file or directory: '${join(fixture.root, 'none.json')}')`,
      },
    })
  })
})

describe('the taste neighbours of the sample (#174)', () => {
  /** The users' ratings of `manyRatings`, as the taste neighbours' sample
   * of the Catalog (capped at 5), with k = 3 and 1 film shared. */
  const sampleOf = async (fixture: Fixture, users: readonly number[]) => {
    const catalog = catalogWith(fixture, {
      'links.csv': links,
      'ratings.csv': manyRatings(),
    })
    const rows = users.flatMap((user) =>
      FILMS.flatMap((film, i) =>
        (user + i + 1) % 3 === 0
          ? []
          : [
              `${user},tt${film},${Math.min(5, ((user * (i + 1)) % 5) + 1 + ((i + 1) % 2 ? 0.5 : 0))}`,
            ],
      ),
    )
    writeFileSync(
      join(catalog, 'notas_gosto_movielens.csv'),
      ['usuario,filme_id,nota', ...rows].join('\n') + '\n',
    )
    const weights = join(fixture.root, 'weights-test.toml')
    writeFileSync(
      weights,
      readFileSync(join(ROOT, 'config/weights.toml'), 'utf8').replace(
        'k = 50\nmin_shared = 10',
        'k = 3\nmin_shared = 1',
      ),
    )
    const vars = { FILMES_CATALOGO: catalog, FILMES_PESOS: weights }
    await fixture.ok(rebuild, vars)
    const result = await fixture.ok(evaluate(), {
      ...vars,
      FILMES_AVALIACOES: join(fixture.root, 'avaliacoes'),
    })
    return result.offline.movielens.predictedRatingError
  }

  /** Users 1 to 100 outside `Random(27)`'s sample of 1,100. */
  const OUTSIDE = [14, 36, 41, 48, 55, 80, 86, 92]

  test('users outside the sample predict the sampled ones', async () => {
    expect((await sampleOf(useFixture(), OUTSIDE)).films).toBeGreaterThan(0)
  })

  test('a sampled user is never a neighbour, not even his own', async () => {
    const sampled = Array.from({ length: 100 }, (_, i) => i + 1).filter(
      (user) => !OUTSIDE.includes(user),
    )
    expect(await sampleOf(useFixture(), sampled)).toEqual({
      films: 0,
      meanAbsoluteError: null,
      rawMeanAbsoluteError: null,
    })
  })
})

describe('the diaries, as recorded', () => {
  test('a Trakt history dates the cut', async () => {
    const fixture = useFixture()
    const trakt = join(ROOT, 'tests/fixture/trakt')
    await fixture.ok(
      importTrakt({
        person: 'teo',
        original: 'trakt.zip',
        content: zipOf(
          ['ratings-movies.json', 'watched-history-1.json'].map(
            (name) =>
              [
                `trakt-export/${name}`,
                readFileSync(join(trakt, name)),
              ] as const,
          ),
        ),
        author: { name: 'Dono', email: 'dono@example.org' },
      }),
    )
    const engine = await expectRecordedOutcome(fixture, {})
    expect(engine.exitCode).toBe(0)
  })

  test('without a data folder the Letterboxd diaries are skipped', async () => {
    const fixture = useFixture()
    const withData = await fixture.ok(evaluate(), {
      FILMES_AVALIACOES: join(fixture.root, 'a'),
    })
    const without = await fixture.ok(evaluate(), {
      FILMES_AVALIACOES: join(fixture.root, 'b'),
      FILMES_DADOS: undefined,
    })
    expect(without.offline).toEqual(withData.offline)
  })
})

describe('the report YAML, edges', () => {
  test('an empty mapping, a list and a scalar at the top', () => {
    expect(dumpReportYaml({})).toBe('{}\n')
    expect(dumpReportYaml([])).toBe('[]\n')
    expect(dumpReportYaml('x')).toBe('x\n...\n')
    expect(dumpReportYaml(null)).toBe('null\n...\n')
    expect(
      dumpReportYaml({ a: Number.NaN, b: Infinity, c: -Infinity, d: 1e-5 }),
    ).toBe('a: .nan\nb: .inf\nc: -.inf\nd: 1.0e-05\n')
  })

  test('a key PyYAML would not keep simple, or a line break, is refused', () => {
    expect(() => dumpReportYaml({ e: 'a\nb' })).toThrow(RangeError)
    expect(() => dumpReportYaml({ '': 1 })).toThrow(RangeError)
    expect(() => dumpReportYaml({ ['k'.repeat(128)]: 1 })).toThrow(RangeError)
  })
})
