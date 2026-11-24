// The Python string and parse rules the data files need (#86) against the
// golden vectors `golden.py` wrote: `strip`, `splitlines`, `repr`,
// `float()`, `date.fromisoformat()` and `" ".join(s.split())`.
import { describe, expect, test } from 'vite-plus/test'
import {
  isIsoDate,
  pyIsoDate,
  pyJoinWords,
  pyParseFloat,
  pyReprStr,
  pyRstrip,
  pySplitlines,
  pyStrip,
} from '../../src/index.ts'
import { codePoints, golden, outcome, same, type Tagged } from './golden.ts'

type Range = readonly [number, number]

describe('Python text', () => {
  const [table, ...rows] = golden<{
    assigned: Range[]
    space: Range[]
    nonPrintable: Range[]
    s: string
    strip: string
    lines: string[]
    repr: string
    words: string
  }>('py-text')
  const assigned = [...codePoints(table?.assigned ?? [])]

  test('pyJoinWords is " ".join(s.split())', () => {
    expect(rows.filter(({ s, words }) => pyJoinWords(s) !== words)).toEqual([])
  })

  test('strip takes the whitespace of str.isspace() on every code point', () => {
    const space = new Set(codePoints(table?.space ?? []))
    const wrong = assigned.filter(
      (cp) => (pyStrip(String.fromCodePoint(cp)) === '') !== space.has(cp),
    )
    expect(wrong).toEqual([])
    expect(rows.length).toBeGreaterThanOrEqual(10_000)
    expect(rows.filter(({ s, strip }) => pyStrip(s) !== strip)).toEqual([])
    expect(
      rows.filter(({ s, strip }) => pyRstrip(pyStrip(s)) !== strip),
    ).toEqual([])
  })

  test('splitlines breaks where str.splitlines() does', () => {
    expect(
      rows.filter(
        ({ s, lines }) =>
          JSON.stringify(pySplitlines(s)) !== JSON.stringify(lines),
      ),
    ).toEqual([])
    expect(pySplitlines('a\r\nb\rc\n')).toEqual(['a', 'b', 'c'])
    expect(pySplitlines('')).toEqual([])
  })

  test('repr quotes and escapes as repr() on every code point', () => {
    const nonPrintable = new Set(codePoints(table?.nonPrintable ?? []))
    const wrong = assigned.filter((cp) => {
      const char = String.fromCodePoint(cp)
      const escaped = pyReprStr(char) !== `'${char}'`
      const python = nonPrintable.has(cp) || char === "'" || char === '\\'
      return escaped !== python
    })
    expect(wrong).toEqual([])
    expect(rows.filter(({ s, repr }) => pyReprStr(s) !== repr)).toEqual([])
    expect(pyReprStr('\ud800')).toBe("'\\ud800'")
  })
})

describe('Python parsers', () => {
  test('pyParseFloat reads what float() reads, and refuses the rest', () => {
    const rows = golden<{ s: string; out: Tagged }>('py-float')
    expect(rows.length).toBeGreaterThanOrEqual(10_000)
    const wrong = rows.flatMap((row) => {
      const got = outcome(() => pyParseFloat(row.s))
      return same(got, row.out) ? [] : [{ ...row, got }]
    })
    expect(wrong).toEqual([])
  })

  test('pyIsoDate is date.fromisoformat().isoformat()', () => {
    const rows = golden<{ s: string; out: string | false }>('iso-date')
    expect(rows.length).toBeGreaterThanOrEqual(10_000)
    expect(
      rows.filter(({ s, out }) => (pyIsoDate(s) ?? false) !== out),
    ).toEqual([])
    expect(rows.filter(({ s, out }) => isIsoDate(s) !== (out !== false))).toEqual(
      [],
    )
    expect(isIsoDate('2026-11-\ud800')).toBe(false)
  })
})
