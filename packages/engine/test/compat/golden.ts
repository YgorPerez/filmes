// Reads the golden vectors `golden.py` wrote with the Python the engine
// replaces, and turns its tagged values back into the port's types.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import type { PyOrderable } from '../../src/index.ts'

/** A value as `golden.py` writes it: a float is {"f": repr}, an int is
 * {"i": str}, a tuple is a list, and an exception is {"error": name}. */
export type Tagged =
  | null
  | boolean
  | string
  | { readonly f: string }
  | { readonly i: string }
  | { readonly error: string }
  | readonly Tagged[]

/** The rows of one vector file, after its header line. */
export const golden = <Row>(name: string): Row[] =>
  gunzipSync(
    readFileSync(new URL(`./golden/${name}.jsonl.gz`, import.meta.url)),
  )
    .toString('utf8')
    .split('\n')
    .filter((line) => line !== '')
    .slice(1)
    .map((line) => JSON.parse(line) as Row)

export const float = (repr: string): number =>
  repr === 'nan'
    ? Number.NaN
    : repr === 'inf'
      ? Number.POSITIVE_INFINITY
      : repr === '-inf'
        ? Number.NEGATIVE_INFINITY
        : Number(repr)

const isList = (value: Tagged): value is readonly Tagged[] =>
  Array.isArray(value)

/** A tagged float as a `number` and a tagged int as a `bigint`. */
export const decode = (value: Tagged): PyOrderable => {
  if (value === null || typeof value !== 'object') return value
  if (isList(value)) return value.map(decode)
  if ('f' in value) return float(value.f)
  if ('i' in value) return BigInt(value.i)
  throw new Error(`not a value: ${JSON.stringify(value)}`)
}

/** What a call gave, tagged like the vectors: a thrown Python exception is
 * {"error": name}. */
export const outcome = (call: () => unknown): unknown => {
  try {
    return call()
  } catch (error) {
    if (error instanceof Error) return { error: error.message.split(':')[0] }
    throw error
  }
}

/** Whether a result is the tagged value Python gave: a float by its bits
 * (NaN equals NaN, -0 is not 0), an int by value. */
export const same = (actual: unknown, expected: Tagged): boolean => {
  if (expected !== null && typeof expected === 'object') {
    if ('error' in expected) {
      return (
        typeof actual === 'object' &&
        actual !== null &&
        'error' in actual &&
        actual.error === expected.error
      )
    }
    if ('f' in expected) return Object.is(actual, float(expected.f))
    if ('i' in expected) {
      return (
        (typeof actual === 'bigint' ||
          (typeof actual === 'number' && Number.isInteger(actual))) &&
        BigInt(actual) === BigInt(expected.i)
      )
    }
  }
  return Object.is(actual, expected)
}

/** Every code point in [[first, last], ...]. */
export function* codePoints(
  ranges: ReadonlyArray<readonly [number, number]>,
): Generator<number> {
  for (const [first, last] of ranges) {
    for (let cp = first; cp <= last; cp++) yield cp
  }
}
