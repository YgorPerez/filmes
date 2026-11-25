// The MovieLens sample and the diaries of `avaliar` against Python, on
// inputs test_avaliar does not reach: quoted and multi-line CSV fields, a
// BOM and CRLF endings, repeated ratings, tags, and the files Python
// refuses (with its messages). Each case runs both engines on the same
// Catalog and database.
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  migrateConfigFile,
  output as tables,
  outputToEnglish,
} from '@filmes/key-migration'
import { describe, expect, test } from 'vite-plus/test'
import {
  dumpReportYaml,
  evaluate,
  importTrakt,
  type Vars,
} from '../../src/index.ts'
import { ROOT, useFixture, type Fixture } from '../fixture.ts'
import { zipOf } from '../imports/zip.ts'
import { python, PYTHON_TIMEOUT } from '../recommendation/support.ts'

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

/** Both engines' outcomes, Python's in English keys; the report path and
 * the paths in messages read the same on both sides. */
const both = async (fixture: Fixture, vars: Vars, py: Vars = {}) => {
  const pyReports = join(fixture.root, 'py-avaliacoes')
  const fromPython = python(fixture, ['avaliar'], {
    ...vars,
    ...py,
    FILMES_AVALIACOES: pyReports,
  })
  const engine = await fixture.run(evaluate(), {
    ...vars,
    FILMES_AVALIACOES: join(fixture.root, 'avaliacoes'),
  })
  const strip = (
    outcome: { exitCode: number; output: unknown },
    english: boolean,
  ) => {
    const raw = outcome.output as Record<string, unknown>
    const error = raw['erro'] as
      | { codigo: string; mensagem: string }
      | undefined
    const output = (
      !english
        ? JSON.parse(JSON.stringify(raw))
        : error
          ? {
              error: {
                code: tables.ERROR_CODES[error.codigo],
                message: error.mensagem,
              },
            }
          : outputToEnglish('avaliar', raw)
    ) as Record<string, unknown>
    delete output['file']
    return { exitCode: outcome.exitCode, output }
  }
  return { python: strip(fromPython, true), engine: strip(engine, false) }
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

describe('avaliar on MovieLens files, against Python', () => {
  test(
    'a messy sample with tags gives the same measures',
    { timeout: PYTHON_TIMEOUT },
    async () => {
      const fixture = useFixture()
      const catalog = catalogWith(fixture, {
        'links.csv': links,
        'ratings.csv': manyRatings(),
        'tags.csv': TAGS,
      })
      const { python: py, engine } = await both(fixture, {
        FILMES_CATALOGO: catalog,
      })
      expect(engine.exitCode).toBe(0)
      expect(engine).toEqual(py)
    },
  )

  test(
    'a small sample warns that MovieLens had few users',
    { timeout: PYTHON_TIMEOUT },
    async () => {
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
      const { python: py, engine } = await both(fixture, {
        FILMES_CATALOGO: catalog,
      })
      expect(engine.exitCode).toBe(0)
      expect((engine.output['warnings'] as string[])[0]).toMatch(
        /^O MovieLens tinha só 4 usuários/,
      )
      expect(engine).toEqual(py)
    },
  )

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
  ])(
    '%s is refused as Python refuses it',
    { timeout: PYTHON_TIMEOUT },
    async (_, files) => {
      const fixture = useFixture()
      const catalog = catalogWith(fixture, files)
      const { python: py, engine } = await both(fixture, {
        FILMES_CATALOGO: catalog,
      })
      expect(engine.exitCode).toBe(1)
      expect(engine).toEqual(py)
    },
  )

  test(
    'a manifest without the MovieLens dump is invalid_versions',
    { timeout: PYTHON_TIMEOUT },
    async () => {
      const fixture = useFixture()
      const catalog = catalogWith(fixture, {
        'links.csv': links,
        'ratings.csv': manyRatings(),
      })
      const pt = join(fixture.root, 'versoes.json')
      writeFileSync(pt, JSON.stringify({ dumps: {} }))
      const en = join(fixture.root, 'catalog-versions.json')
      writeFileSync(
        en,
        migrateConfigFile(
          'versoes-catalogo.json',
          readFileSync(pt, 'utf8'),
          'to-en',
        )!.text,
      )
      const { python: py, engine } = await both(
        fixture,
        { FILMES_CATALOGO: catalog, FILMES_VERSOES: en },
        { FILMES_VERSOES: pt },
      )
      const message = (outcome: typeof engine) =>
        (outcome.output['error'] as { message: string }).message.replace(
          /^\S+: /,
          '<manifest>: ',
        )
      expect(engine.output).toMatchObject({
        error: { code: 'invalid_versions' },
      })
      expect(message(engine)).toBe(message(py))
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
    },
  )
})

describe('the diaries, against Python', () => {
  test(
    'a Trakt history dates the cut',
    { timeout: PYTHON_TIMEOUT },
    async () => {
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
      const { python: py, engine } = await both(fixture, {})
      expect(engine.exitCode).toBe(0)
      expect(engine).toEqual(py)
    },
  )

  test('without a data folder the Letterboxd diaries are skipped, as Python', async () => {
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
