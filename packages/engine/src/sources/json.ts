// Reading an API's JSON the way the Python did, with `dict.get` and
// truthiness: a field that is missing, null or of another shape reads as
// nothing, never as a failure.

/** `value.get(key)` on a JSON object; `undefined` for anything else. */
export const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : undefined

/** Python's `bool(value)` for a JSON value: `null`, `false`, `0`, `""`,
 * `[]` and `{}` are false. */
export const truthy = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object' && value !== null)
    return Object.keys(value).length > 0
  return Boolean(value)
}

/** A JSON string as it is, anything else as `""` (Python's `x or ""` on a
 * field that should be a string). */
export const text = (value: unknown): string =>
  typeof value === 'string' ? value : ''

/** A JSON array as it is, anything else as `[]`. */
export const list = (value: unknown): ReadonlyArray<unknown> =>
  Array.isArray(value) ? value : []
