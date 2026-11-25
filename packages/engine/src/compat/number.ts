// Python's arithmetic and number formatting, where JavaScript's differs.
// A `number` stands for a Python float and a `bigint` for a Python int.
import {
  exactDecimal,
  negative,
  pyExponent,
  roundHalfEven,
  shortestDigits,
} from './exact.ts'
import { pythonError } from './python-error.ts'

const LONG_MIN = -(2n ** 63n)
const LONG_MAX = 2n ** 63n - 1n
const fitsLong = (n: bigint): boolean => n >= LONG_MIN && n <= LONG_MAX

/** float(n), or the OverflowError Python raises when it does not fit. */
const toFloat = (n: bigint): number => {
  const x = Number(n)
  if (!Number.isFinite(x)) {
    throw pythonError('OverflowError', 'int too large to convert to float')
  }
  return x
}

/** Python's `a + b` on ints and floats. */
const add = (a: number | bigint, b: number | bigint): number | bigint => {
  if (typeof a === 'bigint' && typeof b === 'bigint') return a + b
  return (
    (typeof a === 'bigint' ? toFloat(a) : a) +
    (typeof b === 'bigint' ? toFloat(b) : b)
  )
}

/** The rest of the items, added one by one with no compensation. */
const addRest = (
  result: number | bigint,
  items: Iterator<number | bigint>,
): number | bigint => {
  let total = result
  for (let next = items.next(); next.done !== true; next = items.next()) {
    total = add(total, next.value)
  }
  return total
}

/** The total with the compensation in it. A NaN or infinite compensation (an
 * overflowed sum) is left out. */
const compensated = (total: number, compensation: number): number =>
  compensation !== 0 && Number.isFinite(compensation)
    ? total + compensation
    : total

/** The float path of CPython 3.12's `sum`: Neumaier's compensated summation
 * for floats; an int that fits a C long is added plainly, with no
 * compensation; any other int ends the path, compensation included. */
const sumFloats = (
  start: number,
  items: Iterator<number | bigint>,
): number | bigint => {
  let total = start
  let compensation = 0
  for (let next = items.next(); next.done !== true; next = items.next()) {
    const item = next.value
    if (typeof item === 'number') {
      const t = total + item
      compensation +=
        Math.abs(total) >= Math.abs(item) ? total - t + item : item - t + total
      total = t
    } else if (fitsLong(item)) {
      total += Number(item)
    } else {
      return addRest(add(compensated(total, compensation), item), items)
    }
  }
  return compensated(total, compensation)
}

/**
 * Python's `sum(items, start)`, exactly as CPython 3.12 adds: ints add
 * exactly while they fit a C long, then floats add with Neumaier's
 * compensation, so `pySum([0.1] * 10)` is 1, where `reduce` gives
 * 0.9999999999999999. Never add floats with `reduce`: a last-bit difference
 * turns a tie in the ranking into a non-tie. With no `start`, an empty sum
 * is the number 0.
 */
export function pySum(items: Iterable<number>, start?: number): number
export function pySum(
  items: Iterable<number | bigint>,
  start?: number | bigint,
): number | bigint
export function pySum(
  items: Iterable<number | bigint>,
  start?: number | bigint,
): number | bigint {
  const iterator = items[Symbol.iterator]()
  let result = start ?? 0n
  if (typeof result === 'bigint' && fitsLong(result)) {
    let exact = result
    for (let first = true; ; first = false) {
      const next = iterator.next()
      // Python's int 0 is the float overload's number 0.
      if (next.done === true) return first && start === undefined ? 0 : exact
      const item = next.value
      if (typeof item === 'bigint' && fitsLong(item)) {
        const total = exact + item
        if (fitsLong(total)) {
          exact = total
          continue
        }
      }
      result = add(exact, item)
      break
    }
  }
  return typeof result === 'number'
    ? sumFloats(result, iterator)
    : addRest(result, iterator)
}

const requireInteger = (n: number, what: string): void => {
  if (!Number.isSafeInteger(n)) {
    throw pythonError('TypeError', `${what} must be an integer, got ${n}`)
  }
}

/** Python's `round(x)`: the nearest integer, ties to even. */
export function pyRound(x: number): number
/** Python's `round(x, ndigits)`: ties to even on the exact binary value, so
 * `pyRound(0.125, 2)` is 0.12 and `pyRound(2.675, 2)` is 2.67. */
export function pyRound(x: number, ndigits: number): number
export function pyRound(x: number, ndigits?: number): number {
  if (ndigits === undefined) {
    if (Number.isNaN(x)) {
      throw pythonError('ValueError', 'cannot convert float NaN to integer')
    }
    if (!Number.isFinite(x)) {
      throw pythonError(
        'OverflowError',
        'cannot convert float infinity to integer',
      )
    }
    const { digits, exponent } = exactDecimal(x)
    const n = Number(roundHalfEven(digits, exponent))
    return n === 0 ? 0 : x < 0 ? -n : n
  }
  requireInteger(ndigits, 'ndigits')
  if (!Number.isFinite(x) || ndigits > 323) return x
  if (ndigits < -308) return negative(x) ? -0 : 0
  const { digits, exponent } = exactDecimal(x)
  const rounded = Number(
    `${roundHalfEven(digits, exponent + ndigits)}e${-ndigits}`,
  )
  if (!Number.isFinite(rounded)) {
    throw pythonError('OverflowError', 'rounded value too large to represent')
  }
  return negative(x) ? -rounded : rounded
}

const nonFinite = (x: number): string =>
  Number.isNaN(x) ? 'nan' : x > 0 ? 'inf' : '-inf'

/** `0.digits × 10^point` written out without an exponent. */
const positional = (digits: string, point: number): string => {
  if (point <= 0) return `0.${'0'.repeat(-point)}${digits}`
  if (point >= digits.length) return digits + '0'.repeat(point - digits.length)
  return `${digits.slice(0, point)}.${digits.slice(point)}`
}

/** Python's `f"{x:.{decimals}f}"`: ties to even on the exact binary value,
 * so `pyFixed(1.25, 1)` is "1.2", and a negative that rounds to zero keeps
 * its sign ("-0.0"). */
export const pyFixed = (x: number, decimals: number): string => {
  requireInteger(decimals, 'precision')
  if (!Number.isFinite(x)) return nonFinite(x)
  const { digits, exponent } = exactDecimal(x)
  const text = roundHalfEven(digits, exponent + decimals)
    .toString()
    .padStart(decimals + 1, '0')
  const sign = negative(x) ? '-' : ''
  return decimals === 0
    ? sign + text
    : `${sign}${text.slice(0, -decimals)}.${text.slice(-decimals)}`
}

/** Python's `f"{x:g}"` (or `f"{x:.{precision}g}"`): `precision` significant
 * digits, ties to even, trailing zeros dropped, and the exponent form below
 * 1e-4 or from 10^precision up. `pyFormatG(4.5)` is "4.5"; `pyFormatG(5)`
 * is "5". */
export const pyFormatG = (x: number, precision = 6): string => {
  requireInteger(precision, 'precision')
  if (!Number.isFinite(x)) return nonFinite(x)
  const sign = negative(x) ? '-' : ''
  if (x === 0) return `${sign}0`
  const wanted = Math.max(precision, 1)
  const exact = exactDecimal(x)
  const all = exact.digits.toString()
  let point = all.length + exact.exponent
  let digits = all
  if (all.length > wanted) {
    digits = roundHalfEven(exact.digits, wanted - all.length).toString()
    if (digits.length > wanted) {
      // 9.9999995 to 6 digits is 10.0000: one more digit before the point.
      point += 1
      digits = digits.slice(0, wanted)
    }
  }
  digits = digits.replace(/0+$/, '')
  if (point <= -4 || point > wanted) {
    const fraction = digits.length > 1 ? `.${digits.slice(1)}` : ''
    return `${sign}${digits.slice(0, 1)}${fraction}${pyExponent(point - 1)}`
  }
  return sign + positional(digits, point)
}

/** Python's `repr(x)` (and `str(x)`) of a float: "4.0", "1e-05", "1e+16",
 * "0.1", "nan". */
export const pyRepr = (x: number): string => {
  if (!Number.isFinite(x)) return nonFinite(x)
  const sign = negative(x) ? '-' : ''
  const { digits, point } = shortestDigits(x)
  if (point <= -4 || point > 16) {
    const fraction = digits.length > 1 ? `.${digits.slice(1)}` : ''
    return `${sign}${digits.slice(0, 1)}${fraction}${pyExponent(point - 1)}`
  }
  const text = positional(digits, point)
  return sign + (text.includes('.') ? text : `${text}.0`)
}

/** Python's `f"{n:,}".replace(",", ".")`: 3104 is "3.104". */
export const thousandsDot = (n: number | bigint): string => {
  if (typeof n === 'number') requireInteger(n, 'thousandsDot')
  const value = BigInt(n)
  const sign = value < 0n ? '-' : ''
  const digits = (value < 0n ? -value : value).toString()
  return sign + digits.replace(/\B(?=(?:\d{3})+$)/g, '.')
}

/** Python's `str(Decimal(str(x)).quantize(Decimal("0.01"),
 * rounding=ROUND_DOWN)).replace(".", ",")`: two decimals, cut and not
 * rounded, so 0.799 is "0,79". Like Decimal, it refuses an infinity and a
 * result of more than 28 digits. */
export const truncate2 = (x: number): string => {
  if (Number.isNaN(x)) return 'NaN'
  if (!Number.isFinite(x)) {
    throw pythonError('InvalidOperation', 'quantize of an infinity')
  }
  const { digits, point } = shortestDigits(x)
  const shift = point - digits.length + 2
  const coefficient =
    shift >= 0
      ? BigInt(digits) * 10n ** BigInt(shift)
      : BigInt(digits) / 10n ** BigInt(-shift)
  const text = coefficient.toString().padStart(3, '0')
  if (coefficient.toString().length > 28) {
    throw pythonError('InvalidOperation', 'quantize result has too many digits')
  }
  return `${negative(x) ? '-' : ''}${text.slice(0, -2)},${text.slice(-2)}`
}
