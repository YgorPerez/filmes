// Python's parsers where JavaScript's accept other text: `float()` and
// `date.fromisoformat()`.
import { pythonError } from './python-error.ts'
import { pyReprStr } from './text.ts'

/** What `float()` strips: Python's whitespace, except U+001C to U+001F,
 * which it only takes as whitespace past ASCII. */
const FLOAT_SPACE =
  /^[\t\n\v\f\r \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+|[\t\n\v\f\r \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+$/gu

const DECIMAL_DIGIT = /\p{Nd}/u

/** A decimal digit of any script as its ASCII digit, as `float()` reads
 * it: the digits of a script come in runs of ten from zero. */
const asciiDigit = (char: string): string => {
  let cp = char.codePointAt(0) ?? 0
  const at = cp
  while (DECIMAL_DIGIT.test(String.fromCodePoint(cp - 1))) cp -= 1
  return String((at - cp) % 10)
}

const DIGITS = '[0-9](?:_?[0-9])*'
const FLOAT = new RegExp(
  `^[+-]?(?:(?:${DIGITS}(?:\\.(?:${DIGITS})?)?|\\.${DIGITS})(?:[eE][+-]?${DIGITS})?|inf(?:inity)?|nan)$`,
  'i',
)

/** Python's `float(text)` of a str: surrounding whitespace, digits of any
 * script, "_" between digits, "inf", "infinity" and "nan" in any case. A
 * text Python refuses throws its `ValueError`. */
export const pyParseFloat = (text: string): number => {
  const ascii = text
    .replace(FLOAT_SPACE, '')
    .replace(/\p{Nd}/gu, (d) => (/[0-9]/.test(d) ? d : asciiDigit(d)))
  if (!FLOAT.test(ascii))
    throw pythonError(
      'ValueError',
      `could not convert string to float: ${pyReprStr(text)}`,
    )
  const lower = ascii.toLowerCase().replaceAll('_', '')
  const sign = lower.startsWith('-') ? -1 : 1
  const unsigned = lower.replace(/^[+-]/, '')
  if (unsigned.startsWith('inf')) return sign * Number.POSITIVE_INFINITY
  if (unsigned === 'nan') return Number.NaN
  return Number(lower)
}

const isLeap = (year: number) =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)

const daysIn = (year: number, month: number) =>
  month === 2
    ? isLeap(year)
      ? 29
      : 28
    : [4, 6, 9, 11].includes(month)
      ? 30
      : 31

/** Days from 1970-01-01 to a proleptic Gregorian date, and back (Howard
 * Hinnant's civil algorithms), free of `Date`'s two-digit years. */
const daysFromCivil = (year: number, month: number, day: number): number => {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy =
    Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146_097 + doe - 719_468
}

const civilFromDays = (days: number): [number, number, number] => {
  const z = days + 719_468
  const era = Math.floor(z / 146_097)
  const doe = z - era * 146_097
  const yoe = Math.floor(
    (doe -
      Math.floor(doe / 1460) +
      Math.floor(doe / 36_524) -
      Math.floor(doe / 146_096)) /
      365,
  )
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1
  const month = mp < 10 ? mp + 3 : mp - 9
  return [yoe + era * 400 + (month <= 2 ? 1 : 0), month, day]
}

/** Monday = 0, as `date.weekday()`; 1970-01-01 was a Thursday. */
const weekday = (days: number) => (((days + 3) % 7) + 7) % 7

/** The date of an ISO week date, or null when the week or the day is out
 * of range (CPython's `iso_to_ymd`). */
const fromIsoWeek = (
  year: number,
  week: number,
  day: number,
): [number, number, number] | null => {
  const first = daysFromCivil(year, 1, 1)
  const firstWeekday = weekday(first)
  if (week <= 0 || week >= 53) {
    const long = firstWeekday === 3 || (firstWeekday === 2 && isLeap(year))
    if (!(week === 53 && long)) return null
  }
  if (day <= 0 || day >= 8) return null
  const monday = first - firstWeekday + (firstWeekday > 3 ? 7 : 0)
  return civilFromDays(monday + (week - 1) * 7 + day - 1)
}

/** Whether Python 3.12's `date.fromisoformat(text)` takes it:
 * "2026-11-20", "20261120", "2026-W47" and "2026-W47-5" (with or without
 * the hyphens), of 7, 8 or 10 bytes, a valid date from year 1 to 9999.
 * Like CPython, it reads no further than the date it found, so
 * "20261120xx" passes. */
export const isIsoDate = (text: string): boolean => pyIsoDate(text) !== null

/** Python 3.12's `date.fromisoformat(text).isoformat()`: the date as
 * "2026-11-20", or null where Python raises ValueError ("20261120" and
 * "2026-W47-5" are 2026-11-20). */
export const pyIsoDate = (text: string): string | null => {
  const length = Buffer.byteLength(text, 'utf8')
  if (length !== 7 && length !== 8 && length !== 10) return null
  if (!text.isWellFormed()) return null
  const digits = (from: number, count: number): number | null => {
    const part = text.slice(from, from + count)
    return /^[0-9]+$/.test(part) && part.length === count ? Number(part) : null
  }
  let at = 0
  const year = digits(at, 4)
  if (year === null) return null
  at += 4
  const hyphens = text[at] === '-'
  if (hyphens) at += 1
  let ymd: [number, number, number] | null
  if (text[at] === 'W') {
    at += 1
    const week = digits(at, 2)
    if (week === null) return null
    at += 2
    let day = 1
    if (Buffer.byteLength(text.slice(0, at), 'utf8') < length) {
      if (hyphens && text[at++] !== '-') return null
      const read = digits(at, 1)
      if (read === null) return null
      day = read
    }
    ymd = fromIsoWeek(year, week, day)
  } else {
    const month = digits(at, 2)
    if (month === null) return null
    at += 2
    if (hyphens && text[at++] !== '-') return null
    const day = digits(at, 2)
    if (day === null) return null
    ymd = [year, month, day]
  }
  if (ymd === null) return null
  const [y, m, d] = ymd
  if (
    !(y >= 1 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m))
  )
    return null
  const pad = (n: number, width: number) => String(n).padStart(width, '0')
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`
}
