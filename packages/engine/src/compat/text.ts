// Python's text rules where JavaScript's differ: full case folding, the
// letters and digits of `str.isalnum`, and the two slugs the Python engine
// makes.
import { MULTI, RUNS } from './casefold-table.ts'

const FOLDS: ReadonlyMap<string, string> = new Map([
  ...RUNS.flatMap(([first, last, step, shift]) =>
    Array.from(
      { length: (last - first) / step + 1 },
      (_, i): [string, string] => [
        String.fromCodePoint(first + i * step),
        String.fromCodePoint(first + i * step + shift),
      ],
    ),
  ),
  ...MULTI.map(([cp, folded]): [string, string] => [
    String.fromCodePoint(cp),
    folded,
  ]),
])

/** Python's `str.casefold()`, one code point at a time: "ß" is "ss", "ς" is
 * "σ", "ﬁ" is "fi", where `toLowerCase` leaves them. The table is the
 * Unicode of the Python it replaces. */
export const casefold = (text: string): string => {
  let out = ''
  for (const char of text) {
    out += FOLDS.get(char) ?? char
  }
  return out
}

const ALNUM = /^[\p{L}\p{N}]+$/u

/** Python's `str.isalnum()`: not empty, and every code point a letter or a
 * number (any Unicode category L or N). */
export const isalnum = (text: string): boolean => ALNUM.test(text)

/** NFKD, then only ASCII, in lowercase, with each run of other characters
 * as one hyphen and none at the ends. */
const asciiSlug = (text: string): string =>
  text
    .normalize('NFKD')
    .replace(/\P{ASCII}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** The slug Letterboxd usually gives a film: apostrophes and backticks
 * vanish first, so "Noite d'Estreia" is "noite-destreia" and "Hit & Run" is
 * "hit-run" (`importar/zip_letterboxd.py`). */
export const letterboxdSlug = (name: string): string =>
  asciiSlug(name.replace(/['’‘`]/g, ''))

/** The slug of a Pessoa [Person] file name (`dados/pessoas.py` `slug_de`):
 * "Zé Ramalho" is "ze-ramalho". */
export const personSlug = (name: string): string => asciiSlug(name)

/** The code points of Python's `str.isspace()`. */
const SPACE =
  '\t\n\v\f\r\x1c\x1d\x1e\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000'
/** Python's `\s` in a str pattern, the same code points, for a character
 * class of a `u` regex. */
export const PY_SPACE_CLASS = SPACE

const STRIP = new RegExp(`^[${SPACE}]+|[${SPACE}]+$`, 'gu')
const STRIP_END = new RegExp(`[${SPACE}]+$`, 'u')

/** Python's `str.strip()`: its whitespace has the separators U+001C to
 * U+001F and U+0085, which `trim` keeps, and not U+FEFF, which `trim`
 * removes. */
export const pyStrip = (text: string): string => text.replace(STRIP, '')

const SPACES = new RegExp(`[${SPACE}]+`, 'u')

/** Python's `" ".join(text.split())`: the words, one space between them. */
export const pyJoinWords = (text: string): string =>
  pyStrip(text)
    .split(SPACES)
    .filter((word) => word !== '')
    .join(' ')

/** Python's `str.rstrip()`. */
export const pyRstrip = (text: string): string => text.replace(STRIP_END, '')

/** The breaks of `str.splitlines()`, as regex escapes. */
const BREAKS = '\\n\\v\\f\\r\\x1c\\x1d\\x1e\\x85\\u2028\\u2029'
const LINE_BREAK = new RegExp(`\\r\\n|[${BREAKS}]`, 'u')

/** Python's `str.splitlines()`: "\r\n" is one break, and so are "\v", "\f",
 * U+001C to U+001E, U+0085, U+2028 and U+2029; no empty last line. */
export const pySplitlines = (text: string): string[] => {
  const lines = text.split(LINE_BREAK)
  if (lines.at(-1) === '') lines.pop()
  return lines
}

/** What `str.isprintable()` refuses: control, format, surrogate, private
 * use, unassigned and separator code points, except the space. */
const NON_PRINTABLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Cn}\p{Zl}\p{Zp}\p{Zs}]/u

const hex = (cp: number, width: number) => cp.toString(16).padStart(width, '0')

/** Python's `repr()` of a str: single quotes unless only they appear, and
 * the escapes of a code point Python does not print. */
export const pyReprStr = (text: string): string => {
  const quote = text.includes("'") && !text.includes('"') ? '"' : "'"
  let out = quote
  for (const char of text) {
    const cp = char.codePointAt(0) ?? 0
    if (char === quote || char === '\\') out += `\\${char}`
    else if (char === '\t') out += '\\t'
    else if (char === '\n') out += '\\n'
    else if (char === '\r') out += '\\r'
    else if (char === ' ' || !NON_PRINTABLE.test(char)) out += char
    else if (cp < 0x100) out += `\\x${hex(cp, 2)}`
    else if (cp < 0x10000) out += `\\u${hex(cp, 4)}`
    else out += `\\U${hex(cp, 8)}`
  }
  return out + quote
}
