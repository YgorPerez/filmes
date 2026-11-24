/** The exceptions the Python engine let through, and that the port throws
 * in the same places. The message starts with Python's name for it. */
type PythonException =
  | 'OverflowError'
  | 'ValueError'
  | 'TypeError'
  | 'InvalidOperation'

export const pythonError = (
  name: PythonException,
  message: string,
): RangeError | TypeError =>
  name === 'TypeError'
    ? new TypeError(`${name}: ${message}`)
    : new RangeError(`${name}: ${message}`)
