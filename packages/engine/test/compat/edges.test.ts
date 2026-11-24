// The cases the port relies on by name, and the errors the golden vectors
// cannot carry.
import { describe, expect, test } from 'vite-plus/test'
import {
  casefold,
  compareTuple,
  factId,
  pyFixed,
  pyFloat,
  pyFormatG,
  pyInt,
  pyRepr,
  pyRound,
  pyStr,
  pySum,
  thousandsDot,
  truncate2,
} from '../../src/index.ts'

describe('the parity risks of #76', () => {
  test('R1: sum() compensates, reduce does not', () => {
    const tenths = Array.from({ length: 10 }, () => 0.1)
    expect(tenths.reduce((a, b) => a + b, 0)).toBe(0.9999999999999999)
    expect(pySum(tenths)).toBe(1)
    expect(pySum([])).toBe(0)
    expect(pySum([1n, 2n])).toBe(3n)
  })

  test('R2: a fact id hashes str() of the Python type', () => {
    expect(pyStr(pyFloat(4))).toBe('4.0')
    expect(pyStr(pyFloat(1e-5))).toBe('1e-05')
    expect(pyStr(pyFloat(1e16))).toBe('1e+16')
    expect(pyStr(pyInt(4))).toBe('4')
    expect(pyStr(true)).toBe('True')
    expect(pyStr(null)).toBe('None')
    expect(factId('notas', 'ana', pyFloat(4))).not.toBe(
      factId('notas', 'ana', pyInt(4)),
    )
    expect(factId('letterboxd', 'Nome', null)).toBe(
      factId('letterboxd', 'Nome', ''),
    )
  })

  test('R4: rounding is half to even on the exact value', () => {
    expect(pyRound(2.5)).toBe(2)
    expect(pyRound(-0.4)).toBe(0)
    expect(pyRound(0.125, 2)).toBe(0.12)
    expect(pyFixed(1.25, 1)).toBe('1.2')
    expect(pyFixed(-0.04, 1)).toBe('-0.0')
    expect(pyFormatG(4.5)).toBe('4.5')
    expect(pyFormatG(5)).toBe('5')
    expect(pyRepr(-0)).toBe('-0.0')
  })

  test('R5: casefold folds what toLowerCase leaves', () => {
    expect(casefold('Straße')).toBe('strasse')
    expect(casefold('ΟΔΟΣ ς')).toBe('οδοσ σ')
  })

  test('R8: strings order by code point, not UTF-16 unit', () => {
    const astral = String.fromCodePoint(0x1f600)
    const lastOfBmp = String.fromCodePoint(0xffff)
    expect([astral, lastOfBmp].sort()).toEqual([astral, lastOfBmp])
    expect(compareTuple([astral], [lastOfBmp])).toBe(1)
    expect(compareTuple([1, 'b'], [1n, 'a'])).toBe(1)
    expect(compareTuple([2 ** 53], [2n ** 53n + 1n])).toBe(-1)
  })

  test('R12: thousands with dots, two decimals cut', () => {
    expect(thousandsDot(3104)).toBe('3.104')
    expect(thousandsDot(-1234567n)).toBe('-1.234.567')
    expect(truncate2(0.799)).toBe('0,79')
    expect(truncate2(-0.001)).toBe('-0,00')
  })
})

describe('what Python refuses', () => {
  test('a count that is not an integer', () => {
    expect(() => pyRound(1.5, 0.5)).toThrow(TypeError)
    expect(() => pyFixed(1.5, Number.NaN)).toThrow(TypeError)
    expect(() => thousandsDot(1.5)).toThrow(TypeError)
    expect(() => pyStr(pyInt(2 ** 60))).toThrow(TypeError)
  })

  test('an int too large for a float', () => {
    expect(() => pySum([0.5, 10n ** 400n])).toThrow(/^OverflowError/)
  })

  test('a lone surrogate, which UTF-8 cannot encode', () => {
    expect(() => factId('notas', '\ud800')).toThrow(/^ValueError/)
  })

  test('None against a number', () => {
    expect(() => compareTuple([null], [1])).toThrow(/^TypeError/)
  })
})
