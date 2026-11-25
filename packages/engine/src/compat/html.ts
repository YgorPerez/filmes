// Python's `html.unescape`: every named and numeric character reference of
// HTML5, the legacy names without ';' matched by their longest prefix, and
// the numeric references the standard replaces or drops.
import {
  HTML5,
  INVALID_CHARREFS,
  INVALID_CODEPOINTS,
} from './html5-entities.ts'

const CHARREF = /&(#[0-9]+;?|#[xX][0-9a-fA-F]+;?|[^\t\n\f <&#;]{1,32};?)/gu

const NAMES: ReadonlyMap<string, string> = new Map(Object.entries(HTML5))
const INVALID_REFS: ReadonlyMap<string, string> = new Map(
  Object.entries(INVALID_CHARREFS),
)
const INVALID_POINTS: ReadonlySet<number> = new Set(INVALID_CODEPOINTS)

const numeric = (ref: string): string => {
  const hex = ref[1] === 'x' || ref[1] === 'X'
  const digits = ref.slice(hex ? 2 : 1).replace(/;$/, '')
  // A number past the last code point only needs to stay past it.
  const num = digits.length > 12 ? Infinity : parseInt(digits, hex ? 16 : 10)
  const replaced = INVALID_REFS.get(String(num))
  if (replaced !== undefined) return replaced
  if ((num >= 0xd800 && num <= 0xdfff) || num > 0x10ffff) return '\u{FFFD}'
  if (INVALID_POINTS.has(num)) return ''
  return String.fromCodePoint(num)
}

const named = (ref: string): string => {
  const known = NAMES.get(ref)
  if (known !== undefined) return known
  const chars = Array.from(ref)
  for (let x = chars.length - 1; x > 1; x--) {
    const prefix = NAMES.get(chars.slice(0, x).join(''))
    if (prefix !== undefined) return prefix + chars.slice(x).join('')
  }
  return `&${ref}`
}

/** Python's `html.unescape(text)`. */
export const pyHtmlUnescape = (text: string): string =>
  text.includes('&')
    ? text.replace(CHARREF, (_, ref: string) =>
        ref.startsWith('#') ? numeric(ref) : named(ref),
      )
    : text
