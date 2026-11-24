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

/** Python's whitespace (`str.isspace()`), which `trim` does not match: it
 * adds U+001C to U+001F and U+0085 and leaves out U+FEFF. */
const SPACE =
  '\\t\\n\\v\\f\\r\\x1c-\\x20\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000'
const ENDS = new RegExp(`^[${SPACE}]+|[${SPACE}]+$`, 'g')

/** Python's `str.strip()` with no argument. */
export const pyStrip = (text: string): string => text.replace(ENDS, '')
