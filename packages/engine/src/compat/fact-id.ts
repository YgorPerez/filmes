// The fato_id [factId] of a Fato: the table and a hash of Python's `str()`
// of each value. `str(4.0)` is "4.0" where `String(4)` is "4", and
// `node:sqlite` hands a REAL 4.0 back as 4, so every value says which
// Python type it had.
import { createHash } from 'node:crypto'
import { pyRepr } from './number.ts'
import { pythonError } from './python-error.ts'

/** A Python int. */
export interface PyInt {
  readonly int: number | bigint
}

/** A Python float. */
export interface PyFloat {
  readonly float: number
}

/** A value as the Python engine had it: str (also a date, already as
 * "2026-11-20"), bool, None, int or float. A bare number is not allowed:
 * the call site says which one it was. */
export type PyValue = string | boolean | null | PyInt | PyFloat

export const pyInt = (int: number | bigint): PyInt => ({ int })
export const pyFloat = (float: number): PyFloat => ({ float })

/** Python's `str(value)`. */
export const pyStr = (value: PyValue): string => {
  if (value === null) return 'None'
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if ('float' in value) return pyRepr(value.float)
  if (typeof value.int === 'number' && !Number.isSafeInteger(value.int)) {
    throw pythonError('TypeError', `not an int: ${value.int}`)
  }
  return BigInt(value.int).toString()
}

/** The ID of a Fato, stable across rebuilds: the table and the first 12 hex
 * digits of the SHA-1 of the values' `str()`, joined by U+001F, with None
 * as empty (`banco/__init__.py` `fato_id`). */
export const factId = (
  table: string,
  ...values: readonly PyValue[]
): string => {
  const content = values
    .map((value) => (value === null ? '' : pyStr(value)))
    .join('\u001f')
  if (!content.isWellFormed()) {
    // Python's `encode()` refuses a lone surrogate; TextEncoder would hash
    // U+FFFD in its place.
    throw pythonError('ValueError', 'a fact value has a lone surrogate')
  }
  const hash = createHash('sha1').update(content, 'utf8').digest('hex')
  return `${table}:${hash.slice(0, 12)}`
}
