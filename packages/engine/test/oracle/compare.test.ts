// The comparison rules of #76 §4.3.

import { describe, expect, test } from 'vite-plus/test'
import {
  ABSENT,
  compareJson,
  compareOutcomes,
  globRegExp,
  pythonDataPaths,
} from '../../oracle/compare.ts'

describe('compareJson', () => {
  test('ignores key order, keeps array order, and reads 4.0 as 4', () => {
    expect(
      compareJson({ a: 4, b: [1, 2] }, { b: [1, 2], a: 4.0 }, 'output'),
    ).toEqual([])
    expect(compareJson([1, 2], [2, 1], 'output').map((d) => d.path)).toEqual([
      'output[0]',
      'output[1]',
    ])
  })

  test('a key or an item on one side only is absent on the other', () => {
    expect(compareJson({ a: 1 }, { a: 1, b: 2 }, 'output')).toEqual([
      { check: 'parity', path: 'output.b', python: ABSENT, ts: 2 },
    ])
    expect(compareJson([1], [1, 2], 'output')).toEqual([
      { check: 'parity', path: 'output[1]', python: ABSENT, ts: 2 },
    ])
  })

  test('declared paths compare as multisets, or with a tolerance', () => {
    const rules = {
      unordered: ['output.tables'],
      tolerance: { 'output.metrics.*': 1e-9 },
    }

    expect(
      compareJson(
        { tables: [{ n: 1 }, { n: 2 }], metrics: { mrr: 0.1 + 0.2 } },
        { tables: [{ n: 2 }, { n: 1 }], metrics: { mrr: 0.3 } },
        'output',
        rules,
      ),
    ).toEqual([])
    expect(
      compareJson({ tables: [1, 1] }, { tables: [1, 3] }, 'output', rules),
    ).toEqual([
      { check: 'parity', path: 'output.tables', python: 1, ts: ABSENT },
      { check: 'parity', path: 'output.tables', python: ABSENT, ts: 3 },
    ])
  })

  test('strings and types compare exactly', () => {
    expect(compareJson('a', 'a ', 'x')).toHaveLength(1)
    expect(compareJson(null, 0, 'x')).toHaveLength(1)
    expect(compareJson({ a: 1 }, [1], 'x')).toHaveLength(1)
  })
})

describe('compareOutcomes', () => {
  test('the message of an invalid usage is not compared; any other is', () => {
    const usage = (message: string) => ({
      exitCode: 2,
      output: { error: { code: 'invalid_usage', message } },
    })
    const missing = (message: string) => ({
      exitCode: 1,
      output: { error: { code: 'missing_database', message } },
    })

    expect(compareOutcomes(usage('argparse'), usage('outra'))).toEqual([])
    expect(
      compareOutcomes(missing('a'), missing('b')).map((d) => d.path),
    ).toEqual(['error.message'])
    expect(
      compareOutcomes(missing('a'), usage('a')).map((d) => d.path),
    ).toEqual(['exitCode', 'error.code'])
  })

  test('an error against a result compares the whole output', () => {
    const paths = compareOutcomes(
      { exitCode: 0, output: { rows: [] } },
      { exitCode: 1, output: { error: { code: 'internal', message: 'x' } } },
    ).map((d) => d.path)

    expect(paths).toEqual(['exitCode', 'output.rows', 'output.error'])
  })
})

describe('paths', () => {
  test("Python's filmes-dados paths read as the English ones", () => {
    expect(
      pythonDataPaths('arquivo {work}/dados/sessoes/2026-11-20-bruno.md: ok'),
    ).toBe('arquivo {work}/data/sessions/2026-11-20-bruno.md: ok')
    expect(pythonDataPaths('{work}/dados')).toBe('{work}/data')
    expect(pythonDataPaths('{work}/dados/imports/bruno/x.zip')).toBe(
      '{work}/data/imports/bruno/x.zip',
    )
  })

  test('globs: * is any run of characters, ? one, the rest literal', () => {
    expect(
      globRegExp('output.films[*].text').test('output.films[3].text'),
    ).toBe(true)
    expect(
      globRegExp('tests/test_?.py::*').test('tests/test_a.py::test_b'),
    ).toBe(true)
    expect(globRegExp('output.a').test('output.ab')).toBe(false)
  })
})
