// Every Python-compat primitive against the golden vectors Python wrote
// (`golden.py`): at least 10,000 random and edge inputs each, and every
// code point Python knows for the text rules.
import { describe, expect, test } from 'vite-plus/test'
import {
  casefold,
  compareTuple,
  factId,
  isalnum,
  letterboxdSlug,
  personSlug,
  pyFixed,
  pyFloat,
  pyFormatG,
  pyInt,
  pyRound,
  pyStr,
  pyStrip,
  pySum,
  thousandsDot,
  truncate2,
  type PyOrderable,
  type PyValue,
} from '../../src/index.ts'
import {
  codePoints,
  decode,
  float,
  golden,
  outcome,
  same,
  type Tagged,
} from './golden.ts'

type Range = readonly [number, number]

/** The vectors a primitive got wrong, with what it gave instead. */
const misses = <Row extends { out: Tagged }>(
  rows: readonly Row[],
  call: (row: Row) => unknown,
): Array<Row & { got: unknown }> =>
  rows.flatMap((row) => {
    const got = outcome(() => call(row))
    return same(got, row.out) ? [] : [{ ...row, got }]
  })

const numeric = (value: PyOrderable): number | bigint => {
  if (typeof value === 'number' || typeof value === 'bigint') return value
  throw new Error(`not a number: ${String(value)}`)
}

const atLeast10k = (rows: readonly unknown[]): void => {
  expect(rows.length).toBeGreaterThanOrEqual(10_000)
}

describe('numbers', () => {
  test('pySum adds as CPython sum()', () => {
    const rows = golden<{ in: Tagged[]; start: Tagged; out: Tagged }>('py-sum')
    atLeast10k(rows)
    expect(
      misses(rows, (row) =>
        pySum(
          row.in.map((v) => numeric(decode(v))),
          numeric(decode(row.start)),
        ),
      ),
    ).toEqual([])
  })

  test('pyRound rounds as round()', () => {
    const rows = golden<{ x: { f: string }; n: Tagged; out: Tagged }>(
      'py-round',
    )
    atLeast10k(rows)
    expect(
      misses(rows, ({ x, n }) =>
        n === null
          ? pyRound(float(x.f))
          : pyRound(float(x.f), Number(numeric(decode(n)))),
      ),
    ).toEqual([])
  })

  test('pyFixed formats as :.nf', () => {
    const rows = golden<{ x: { f: string }; n: number; out: string }>(
      'py-fixed',
    )
    atLeast10k(rows)
    expect(misses(rows, ({ x, n }) => pyFixed(float(x.f), n))).toEqual([])
  })

  test('pyFormatG formats as :g and :.ng', () => {
    const rows = golden<{ x: { f: string }; p: number | null; out: string }>(
      'py-format-g',
    )
    atLeast10k(rows)
    expect(
      misses(rows, ({ x, p }) =>
        p === null ? pyFormatG(float(x.f)) : pyFormatG(float(x.f), p),
      ),
    ).toEqual([])
  })

  test('thousandsDot groups as :, with dots', () => {
    const rows = golden<{ n: { i: string }; out: string }>('thousands-dot')
    atLeast10k(rows)
    expect(misses(rows, ({ n }) => thousandsDot(BigInt(n.i)))).toEqual([])
    const small = rows.filter(({ n }) => Number.isSafeInteger(Number(n.i)))
    expect(misses(small, ({ n }) => thousandsDot(Number(n.i)))).toEqual([])
  })

  test('truncate2 cuts to two decimals as Decimal.quantize', () => {
    const rows = golden<{ x: { f: string }; out: Tagged }>('truncate2')
    atLeast10k(rows)
    expect(misses(rows, ({ x }) => truncate2(float(x.f)))).toEqual([])
  })
})

describe('text', () => {
  test('casefold folds every code point as str.casefold()', () => {
    const [table, ...rows] = golden<{
      assigned: Range[]
      folds: Record<string, string>
      s: string
      out: string
    }>('casefold')
    const wrong = [...codePoints(table?.assigned ?? [])].flatMap((cp) => {
      const char = String.fromCodePoint(cp)
      const want = table?.folds[cp] ?? char
      return casefold(char) === want ? [] : [{ cp, want, got: casefold(char) }]
    })
    expect(wrong).toEqual([])
    atLeast10k(rows)
    expect(misses(rows, ({ s }) => casefold(s))).toEqual([])
  })

  test('isalnum agrees with str.isalnum() on every code point', () => {
    const [table, ...rows] = golden<{
      assigned: Range[]
      alnum: Range[]
      s: string
      out: boolean
    }>('isalnum')
    const alnum = new Set(codePoints(table?.alnum ?? []))
    const wrong = [...codePoints(table?.assigned ?? [])].filter(
      (cp) => isalnum(String.fromCodePoint(cp)) !== alnum.has(cp),
    )
    expect(wrong).toEqual([])
    atLeast10k(rows)
    expect(misses(rows, ({ s }) => isalnum(s))).toEqual([])
  })

  test('the Letterboxd and Pessoa slugs match on every code point', () => {
    const [table, ...rows] = golden<{
      assigned: Range[]
      nonEmpty: Record<string, [string, string]>
      s: string
      letterboxd: string
      person: string
    }>('slug')
    const wrong = [...codePoints(table?.assigned ?? [])].flatMap((cp) => {
      const char = String.fromCodePoint(cp)
      const want = table?.nonEmpty[cp] ?? ['', '']
      const got = [letterboxdSlug(char), personSlug(char)]
      return got[0] === want[0] && got[1] === want[1] ? [] : [{ cp, want, got }]
    })
    expect(wrong).toEqual([])
    atLeast10k(rows)
    expect(
      misses(
        rows.map((row) => ({ ...row, out: row.letterboxd })),
        ({ s }) => letterboxdSlug(s),
      ),
    ).toEqual([])
    expect(
      misses(
        rows.map((row) => ({ ...row, out: row.person })),
        ({ s }) => personSlug(s),
      ),
    ).toEqual([])
  })

  test('pyStrip strips what str.strip() strips', () => {
    const [table, ...rows] = golden<{
      space: Range[]
      s: string
      out: string
    }>('strip')
    const space = new Set(codePoints(table?.space ?? []))
    const wrong = [...codePoints([[0, 0x10ffff]])].filter(
      (cp) => (pyStrip(String.fromCodePoint(cp)) === '') !== space.has(cp),
    )
    expect(wrong).toEqual([])
    atLeast10k(rows)
    expect(misses(rows, ({ s }) => pyStrip(s))).toEqual([])
  })
})

/** A tagged part as the typed value the port's call sites pass. */
const part = (value: Tagged): PyValue => {
  const decoded = decode(value)
  if (typeof value === 'object' && value !== null && 'f' in value) {
    return pyFloat(float(value.f))
  }
  if (typeof decoded === 'bigint') return pyInt(decoded)
  if (typeof decoded === 'number' || Array.isArray(decoded)) {
    throw new Error(`not a part: ${JSON.stringify(value)}`)
  }
  return decoded as string | boolean | null
}

describe('fact ids and ordering', () => {
  test('pyStr and factId hash as fato_id', () => {
    const rows = golden<{
      table: string
      parts: Tagged[]
      str: string[]
      out: string
    }>('fact-id')
    atLeast10k(rows)
    const strings = rows.flatMap((row) =>
      row.parts.flatMap((p, i) =>
        pyStr(part(p)) === row.str[i] ? [] : [{ p, want: row.str[i] }],
      ),
    )
    expect(strings).toEqual([])
    expect(
      misses(rows, (row) => factId(row.table, ...row.parts.map(part))),
    ).toEqual([])
  })

  test('compareTuple orders as Python tuples', () => {
    const rows = golden<{ a: Tagged[]; b: Tagged[]; out: Tagged }>(
      'compare-tuple',
    )
    atLeast10k(rows)
    expect(
      misses(rows, ({ a, b }) =>
        BigInt(compareTuple(a.map(decode), b.map(decode))),
      ),
    ).toEqual([])
  })
})
