// Python's `math.log1p` on an int. V8's `Math.log1p` (fdlibm) and glibc's
// differ in the last bit for a few ints, and the similarity weighs each
// MovieLens tag by `log1p(users)`, so a different bit could break a tie in
// the order. The table holds those ints, as Python gives them.

import { LOG1P_CHECKED_UP_TO, LOG1P_EXCEPTIONS } from './log1p-table.ts'

const EXCEPTIONS = new Map(LOG1P_EXCEPTIONS)

/** `math.log1p(n)` for an int `n` from 0 up to `LOG1P_CHECKED_UP_TO`
 * (MovieLens counts users, about 200,000); above it, `Math.log1p`, which
 * may differ from Python in the last bit. */
export const pyLog1pInt = (n: number): number => {
  if (!Number.isInteger(n) || n < 0)
    throw new RangeError(`pyLog1pInt takes an int from 0 up, not ${n}`)
  if (n > LOG1P_CHECKED_UP_TO) return Math.log1p(n)
  return EXCEPTIONS.get(n) ?? Math.log1p(n)
}
