// Python 3.12's `datetime.fromisoformat` (the C implementation in
// `_datetimemodule.c`, which is stricter than `_pydatetime`), for the
// instants of the Trakt export. It works on the UTF-8 bytes with a NUL after
// them, as the C code does.
import { fromIsoWeek, isValidDate } from './parse.ts'

const NUL = 0
const DASH = 0x2d
const COLON = 0x3a
const DOT = 0x2e
const COMMA = 0x2c
const PLUS = 0x2b
const W = 0x57
const Z = 0x5a

const isDigit = (byte: number | undefined): boolean =>
  byte !== undefined && byte >= 0x30 && byte <= 0x39

/** `parse_digits`: `count` ASCII digits from `at`, or null. */
const digits = (buf: Uint8Array, at: number, count: number): number | null => {
  let value = 0
  for (let i = 0; i < count; i++) {
    const byte = buf[at + i]
    if (!isDigit(byte)) return null
    value = value * 10 + ((byte ?? 0) - 0x30)
  }
  return value
}

/** `_find_isoformat_datetime_separator`. */
const separatorAt = (buf: Uint8Array, length: number): number => {
  if (length === 7) return 7
  if (buf[4] === DASH) {
    if (buf[5] !== W) return 10
    if (length < 8) return -1
    if (length > 8 && buf[8] === DASH) {
      if (length === 9) return -1
      return length > 10 && isDigit(buf[10]) ? 8 : 10
    }
    return 8
  }
  if (buf[4] !== W) return 8
  let at = 7
  while (at < length && isDigit(buf[at])) at++
  if (at < 9) return at
  return at % 2 === 0 ? 7 : 8
}

type Ymd = readonly [number, number, number]

/** `parse_isoformat_date`: reads no further than the date it finds. */
const parseDate = (buf: Uint8Array, length: number): Ymd | null => {
  let at = 0
  const year = digits(buf, at, 4)
  if (year === null) return null
  at += 4
  const separated = buf[at] === DASH
  if (separated) at++
  if (buf[at] === W) {
    at++
    const week = digits(buf, at, 2)
    if (week === null) return null
    at += 2
    let day = 1
    if (at < length) {
      if (separated && buf[at++] !== DASH) return null
      const read = digits(buf, at, 1)
      if (read === null) return null
      day = read
    }
    if (year < 1 || year > 9999) return null
    return fromIsoWeek(year, week, day)
  }
  const month = digits(buf, at, 2)
  if (month === null) return null
  at += 2
  if (separated && buf[at++] !== DASH) return null
  const day = digits(buf, at, 2)
  if (day === null) return null
  return [year, month, day]
}

const CORRECTION = [100_000, 10_000, 1000, 100, 10]

interface Clock {
  readonly hour: number
  readonly minute: number
  readonly second: number
  readonly micro: number
  /** 1 when something follows the time, as the C code returns it. */
  readonly rest: 0 | 1
}

/** `parse_hh_mm_ss_ff`: HH[:?MM[:?SS[{.,}ffffff]]] up to `end`; null for
 * the C code's negative results. */
const parseClock = (
  buf: Uint8Array,
  start: number,
  end: number,
): Clock | null => {
  const values = [0, 0, 0]
  let at = start
  let separated = true
  for (let i = 0; i < 3; i++) {
    const value = digits(buf, at, 2)
    if (value === null) return null
    values[i] = value
    at += 2
    const c = buf[at] ?? NUL
    at++
    if (i === 0) separated = c === COLON
    if (at >= end) {
      const [hour = 0, minute = 0, second = 0] = values
      return { hour, minute, second, micro: 0, rest: c === NUL ? 0 : 1 }
    }
    if (separated && c === COLON) continue
    if (c === DOT || c === COMMA) break
    if (!separated) at--
    else return null
  }
  const toParse = Math.min(end - at, 6)
  let micro = digits(buf, at, toParse)
  if (micro === null) return null
  at += toParse
  if (toParse >= 1 && toParse < 6) micro *= CORRECTION[toParse - 1] ?? 1
  while (isDigit(buf[at])) at++
  const [hour = 0, minute = 0, second = 0] = values
  return { hour, minute, second, micro, rest: (buf[at] ?? NUL) === NUL ? 0 : 1 }
}

interface Time extends Omit<Clock, 'rest'> {
  /** Microseconds east of UTC, or null for a naive time. */
  readonly offset: bigint | null
}

/** `parse_isoformat_time`. */
const parseTime = (
  buf: Uint8Array,
  start: number,
  end: number,
): Time | null => {
  let tz = start
  do {
    const byte = buf[tz]
    if (byte === Z || byte === PLUS || byte === DASH) break
  } while (++tz < end)
  const clock = parseClock(buf, start, tz)
  if (clock === null) return null
  const { rest: _, ...time } = clock
  if (tz === end) return clock.rest === 1 ? null : { ...time, offset: null }
  if (buf[tz] === Z)
    return (buf[tz + 1] ?? NUL) !== NUL ? null : { ...time, offset: 0n }
  const sign = buf[tz] === DASH ? -1n : 1n
  const zone = parseClock(buf, tz + 1, end)
  if (zone === null || zone.rest === 1) return null
  const seconds = BigInt(zone.hour * 3600 + zone.minute * 60 + zone.second)
  return {
    ...time,
    offset: sign * (seconds * 1_000_000n + BigInt(zone.micro)),
  }
}

const DAY = 86_400_000_000n

const daysFromCivil = (year: number, month: number, day: number): number => {
  const y = month <= 2 ? year - 1 : year
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy =
    Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1
  return (
    era * 146_097 +
    yoe * 365 +
    Math.floor(yoe / 4) -
    Math.floor(yoe / 100) +
    doy -
    719_468
  )
}

const civilFromDays = (days: number): Ymd => {
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
  const month = mp < 10 ? mp + 3 : mp - 9
  return [
    yoe + era * 400 + (month <= 2 ? 1 : 0),
    month,
    doy - Math.floor((153 * mp + 2) / 5) + 1,
  ]
}

const pad = (n: number | bigint, width: number) =>
  String(n).padStart(width, '0')

/** Replaces a lone surrogate at the separator's possible places (7, 8,
 * 10) by "T", as `_sanitize_isoformat_str`; null when Python refuses the
 * string before parsing it. */
const sanitized = (text: string): string | null => {
  const points = Array.from(text)
  if (points.length < 7) return null
  for (const at of [7, 8, 10]) {
    if (at > points.length) break
    const point = points[at]?.codePointAt(0) ?? 0
    if (point >= 0xd800 && point <= 0xdfff) {
      points[at] = 'T'
      break
    }
  }
  const clean = points.join('')
  return clean.isWellFormed() ? clean : null
}

/** `datetime.fromisoformat(text)`, a naive one taken as UTC, then
 * `.astimezone(UTC).isoformat(timespec="microseconds")`: the instant as
 * "2025-02-03T19:00:00.000000+00:00", or null where Python raises
 * ValueError or OverflowError. */
export const pyIsoInstantUtc = (text: string): string | null => {
  const clean = sanitized(text)
  if (clean === null) return null
  const bytes = Buffer.from(clean, 'utf8')
  const length = bytes.length
  const buf = new Uint8Array(length + 1)
  buf.set(bytes)
  const separator = separatorAt(buf, length)
  if (separator < 0) return null
  const date = parseDate(buf, separator)
  if (date === null) return null
  let time: Time = { hour: 0, minute: 0, second: 0, micro: 0, offset: null }
  if (length > separator) {
    // The separator may be any one character; its UTF-8 length is in its
    // first byte.
    const lead = buf[separator] ?? 0
    const skip =
      (lead & 0x80) === 0
        ? 1
        : (lead & 0xf0) === 0xe0
          ? 3
          : (lead & 0xf0) === 0xf0
            ? 4
            : 2
    const parsed = parseTime(buf, separator + skip, length)
    if (parsed === null) return null
    time = parsed
  }
  const [year, month, day] = date
  if (!isValidDate(year, month, day)) return null
  if (time.hour > 23 || time.minute > 59 || time.second > 59) return null
  const offset = time.offset ?? 0n
  if (offset <= -DAY || offset >= DAY) return null
  const local =
    BigInt(daysFromCivil(year, month, day)) * DAY +
    BigInt(time.hour * 3600 + time.minute * 60 + time.second) * 1_000_000n +
    BigInt(time.micro)
  const utc = local - offset
  let days = utc / DAY
  let within = utc % DAY
  if (within < 0n) {
    within += DAY
    days -= 1n
  }
  const [y, m, d] = civilFromDays(Number(days))
  if (y < 1 || y > 9999) return null
  const seconds = within / 1_000_000n
  return (
    `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}T` +
    `${pad(seconds / 3600n, 2)}:${pad((seconds / 60n) % 60n, 2)}:${pad(seconds % 60n, 2)}.` +
    `${pad(within % 1_000_000n, 6)}+00:00`
  )
}
