// The SQL functions every connection gets, as Python registered them with
// `create_function(..., deterministic=True)`. They throw where Python's
// `math` raised (a NULL, a value outside the domain), so a query fails the
// same way on both sides instead of returning -Infinity.
//
// Still missing: `dobrar` (Python's `str.casefold`, used by `feedback` to
// match titles), which comes with the `casefold` helper of #76's E1. A new
// function is one more entry here.

import type { SQLInputValue, SQLOutputValue } from 'node:sqlite'

export interface SqlFunction {
  readonly name: string
  readonly fn: (...args: SQLOutputValue[]) => SQLInputValue
}

const real = (name: string, value: SQLOutputValue | undefined): number => {
  if (typeof value !== 'number' && typeof value !== 'bigint')
    throw new TypeError(`${name}: must be real number, not ${String(value)}`)
  return Number(value)
}

const domainError = (name: string): Error =>
  new RangeError(`${name}: math domain error`)

export const SQL_FUNCTIONS: ReadonlyArray<SqlFunction> = [
  {
    name: 'ln',
    fn: (value) => {
      const x = real('ln', value)
      if (x <= 0) throw domainError('ln')
      return Math.log(x)
    },
  },
  {
    name: 'ln1p',
    fn: (value) => {
      const x = real('ln1p', value)
      if (x <= -1) throw domainError('ln1p')
      return Math.log1p(x)
    },
  },
]
