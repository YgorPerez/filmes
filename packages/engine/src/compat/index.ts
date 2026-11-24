// Python-compat primitives: where JavaScript's arithmetic, formatting, text
// rules or ordering differ from the Python engine's, the port goes through
// these, so its output matches the Python's (map #72, ticket #81).
export { compareTuple, type PyOrderable } from './compare.ts'
export {
  factId,
  pyFloat,
  pyInt,
  pyStr,
  type PyFloat,
  type PyInt,
  type PyValue,
} from './fact-id.ts'
export {
  pyFixed,
  pyFormatG,
  pyRepr,
  pyRound,
  pySum,
  thousandsDot,
  truncate2,
} from './number.ts'
export {
  casefold,
  isalnum,
  letterboxdSlug,
  personSlug,
  pyStrip,
} from './text.ts'
