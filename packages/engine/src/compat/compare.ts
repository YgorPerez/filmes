// Python's ordering of tuples, for sort keys. A `number` stands for a float
// (or an int that fits one exactly), a `bigint` for any int, and a boolean
// for the int it is in Python.
import { pythonError } from './python-error.ts'

export type PyOrderable =
  | number
  | bigint
  | string
  | boolean
  | null
  | readonly PyOrderable[]

type Numeric = number | bigint | boolean

const isNumeric = (value: PyOrderable): value is Numeric =>
  typeof value === 'number' ||
  typeof value === 'bigint' ||
  typeof value === 'boolean'

const asNumber = (value: Numeric): number | bigint =>
  typeof value === 'boolean' ? (value ? 1n : 0n) : value

/** -1, 0 or 1 for an int against a float, exactly; NaN for a NaN. */
const compareIntFloat = (int: bigint, float: number): number => {
  if (Number.isNaN(float)) return Number.NaN
  if (!Number.isFinite(float)) return float > 0 ? -1 : 1
  const floor = BigInt(Math.floor(float))
  if (int < floor) return -1
  if (int > floor) return 1
  return Number.isInteger(float) ? 0 : -1
}

/** Python's numeric comparison: NaN when unordered (a NaN). */
const compareNumbers = (a: Numeric, b: Numeric): number => {
  const x = asNumber(a)
  const y = asNumber(b)
  if (typeof x === 'bigint' && typeof y === 'bigint') {
    return x < y ? -1 : x > y ? 1 : 0
  }
  if (typeof x === 'bigint') return compareIntFloat(x, y as number)
  if (typeof y === 'bigint') return -compareIntFloat(y, x)
  if (Number.isNaN(x) || Number.isNaN(y)) return Number.NaN
  return x < y ? -1 : x > y ? 1 : 0
}

/** Strings by code point, as Python compares them. JavaScript's `<` compares
 * UTF-16 units, which puts U+10000 and up before U+E000–U+FFFF. */
const compareStrings = (a: string, b: string): number => {
  const length = Math.min(a.length, b.length)
  for (let i = 0; i < length; i++) {
    const x = a.charCodeAt(i)
    const y = b.charCodeAt(i)
    if (x !== y) {
      // A surrogate (D800–DFFF) belongs above E000–FFFF.
      const surrogateX = x >= 0xd800 && x <= 0xdfff
      const surrogateY = y >= 0xd800 && y <= 0xdfff
      if (surrogateX !== surrogateY) return surrogateX ? 1 : -1
      return x < y ? -1 : 1
    }
  }
  return a.length < b.length ? -1 : a.length > b.length ? 1 : 0
}

const isTuple = (value: PyOrderable): value is readonly PyOrderable[] =>
  Array.isArray(value)

const kind = (value: PyOrderable): string =>
  value === null
    ? 'NoneType'
    : isTuple(value)
      ? 'tuple'
      : isNumeric(value)
        ? 'number'
        : typeof value

/** Python's `a == b` for these values. */
const equal = (a: PyOrderable, b: PyOrderable): boolean => {
  if (isNumeric(a) && isNumeric(b)) return compareNumbers(a, b) === 0
  if (typeof a === 'string' && typeof b === 'string') return a === b
  if (a === null || b === null) return a === b
  if (isTuple(a) && isTuple(b)) {
    return a.length === b.length && a.every((x, i) => equal(x, b[i] ?? null))
  }
  return false
}

/** -1, 0 or 1 as Python orders two values: NaN when neither `<` nor `>` holds
 * (a NaN), a TypeError when Python refuses to order them. */
const order = (a: PyOrderable, b: PyOrderable): number => {
  if (isNumeric(a) && isNumeric(b)) return compareNumbers(a, b)
  if (typeof a === 'string' && typeof b === 'string') {
    return compareStrings(a, b)
  }
  if (isTuple(a) && isTuple(b)) {
    const length = Math.min(a.length, b.length)
    for (let i = 0; i < length; i++) {
      const x = a[i] ?? null
      const y = b[i] ?? null
      if (!equal(x, y)) return order(x, y)
    }
    return a.length < b.length ? -1 : a.length > b.length ? 1 : 0
  }
  throw pythonError(
    'TypeError',
    `'<' not supported between instances of '${kind(a)}' and '${kind(b)}'`,
  )
}

/**
 * Python's ordering of two tuples: -1, 0 or 1, as `(a > b) - (a < b)`. The
 * first pair that is not equal decides; a NaN there makes the tuples tie, as
 * in Python. Mixing a str and a number at the deciding index, or None with
 * anything else, throws Python's TypeError.
 *
 * For `sorted(..., key=..., reverse=True)`, sort with the comparator
 * inverted, never sort and then reverse: Python keeps ties in input order
 * both ways.
 */
export const compareTuple = (
  a: readonly PyOrderable[],
  b: readonly PyOrderable[],
): -1 | 0 | 1 => {
  const result = order(a, b)
  return result < 0 ? -1 : result > 0 ? 1 : 0
}
