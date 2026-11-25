// The evaluation's primitives against the golden vectors Python wrote
// (`golden.py`): `Random(seed).sample`, `statistics.mean`, the item-item
// neighbourhood (`vizinhos.calcular`) and the report's YAML.
import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vite-plus/test'
import {
  computeNeighbors,
  dumpReportYaml,
  PyRandom,
  pyMean,
  type ReportValue,
} from '../../src/index.ts'
import { float, golden, outcome, type Tagged } from '../compat/golden.ts'

const HERE = new URL('./golden/', import.meta.url)

describe('Random(seed).sample', () => {
  test('draws what CPython 3.12 draws, then the same next bits', () => {
    const rows = golden<{
      seed: string
      n: number
      k: number
      out: number[] | string
      after: number
    }>('sample', HERE)
    expect(rows.length).toBeGreaterThan(400)
    const misses = rows.filter((row) => {
      const random = new PyRandom(BigInt(row.seed))
      const picks = random.sample(
        Array.from({ length: row.n }, (_, i) => i),
        row.k,
      )
      const out =
        typeof row.out === 'string'
          ? createHash('sha256').update(picks.join(',')).digest('hex')
          : picks
      return (
        JSON.stringify(out) !== JSON.stringify(row.out) ||
        random.getrandbits(32) !== row.after
      )
    })
    expect(misses).toEqual([])
  })

  test('refuses a sample larger than the population, as Python', () => {
    expect(() => new PyRandom(1).sample([1, 2], 3)).toThrow(/^ValueError/)
    expect(() => new PyRandom(1).getrandbits(33)).toThrow(RangeError)
    expect(new PyRandom(1).getrandbits(0)).toBe(0)
    expect(new PyRandom(1).randbelow(0)).toBe(0)
  })
})

describe('statistics.mean', () => {
  test('is exact, rounded once', () => {
    const rows = golden<{ values: Array<{ f: string }>; out: Tagged }>(
      'mean',
      HERE,
    )
    const misses = rows.filter((row) => {
      const got = outcome(() => pyMean(row.values.map((v) => float(v.f))))
      const want =
        typeof row.out === 'object' && row.out !== null && 'f' in row.out
          ? float(row.out.f)
          : row.out
      return !Object.is(got, want) && !(typeof want === 'object')
    })
    expect(misses).toEqual([])
    expect(() => pyMean([])).toThrow(/^StatisticsError/)
  })
})

describe('vizinhos.calcular', () => {
  test('gives the same neighbours, bases, counts and batches', () => {
    const rows = golden<{
      films: string[]
      items: number[]
      users: number[]
      seeds: number[] | null
      out: Array<[string, string, number, number]>
      batches: Array<[number, number]>
    }>('neighbors', HERE)
    for (const row of rows) {
      const batches: Array<[number, number]> = []
      const out = [
        ...computeNeighbors(
          row.films,
          Int32Array.from(row.items),
          Int32Array.from(row.users),
          {
            ...(row.seeds !== null && { seeds: row.seeds }),
            onBatch: (done, total) => batches.push([done, total]),
          },
        ),
      ]
      expect(out).toEqual(row.out)
      expect(batches).toEqual(row.batches)
    }
  })
})

describe('the report YAML', () => {
  test('is what yaml.safe_dump(allow_unicode=True, sort_keys=True) writes', () => {
    const rows = golden<{ tree: ReportValue; out: string }>('report-yaml', HERE)
    const misses = rows
      .map((row) => ({ row, got: dumpReportYaml(row.tree) }))
      .filter(({ row, got }) => got !== row.out)
    expect(misses.slice(0, 3)).toEqual([])
  })
})
