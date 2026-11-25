// Python's `email.utils.parsedate_to_datetime(text).date()`: the day an RFC
// 2822 date names, in the offset it was written in (`_parsedate_tz`, with
// its leniency: no weekday, day and month swapped, two-digit years, "."
// between the time's parts).
import { isValidDate, pyParseInt } from './parse.ts'
import { PY_SPACE_CLASS } from './text.ts'

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]
const ZONES: Readonly<Record<string, number>> = {
  UT: 0,
  UTC: 0,
  GMT: 0,
  Z: 0,
  AST: -400,
  ADT: -300,
  EST: -500,
  EDT: -400,
  CST: -600,
  CDT: -500,
  MST: -700,
  MDT: -600,
  PST: -800,
  PDT: -700,
}

const SPLIT = new RegExp(`[${PY_SPACE_CLASS}]+`, 'u')

/** The offset in seconds, null for "-0000" or none, as `_parsedate_tz`. */
const offsetOf = (zone: string): number | null => {
  const upper = zone.toUpperCase()
  let offset: number | null = Object.hasOwn(ZONES, upper)
    ? (ZONES[upper] ?? null)
    : pyParseInt(upper)
  if (offset === 0 && upper.startsWith('-')) offset = null
  if (!offset) return offset
  const sign = offset < 0 ? -1 : 1
  const abs = Math.abs(offset)
  return sign * (Math.floor(abs / 100) * 3600 + (abs % 100) * 60)
}

/** "YYYY-MM-DD" of the date, or null where Python raises ValueError or
 * TypeError. */
export const pyEmailDate = (text: string): string | null => {
  if (!text) return null
  let data = text.split(SPLIT).filter((part) => part !== '')
  if (data.length === 0) return null
  const first = data[0] ?? ''
  if (first.endsWith(',') || DAYS.includes(first.toLowerCase())) data.shift()
  else {
    const comma = first.lastIndexOf(',')
    if (comma >= 0) data[0] = first.slice(comma + 1)
  }
  if (data.length === 3) {
    const parts = (data[0] ?? '').split('-')
    if (parts.length === 3) data = [...parts, ...data.slice(1)]
  }
  if (data.length === 4) {
    const s = data[3] ?? ''
    let i = s.indexOf('+')
    if (i === -1) i = s.indexOf('-')
    if (i > 0) data = [...data.slice(0, 3), s.slice(0, i), s.slice(i)]
    else data.push('')
  }
  if (data.length < 5) return null
  let [dd = '', mm = '', yy = '', tm = '', tz = ''] = data
  if (!(dd && mm && yy)) return null
  mm = mm.toLowerCase()
  if (!MONTHS.includes(mm)) {
    ;[dd, mm] = [mm, dd.toLowerCase()]
    if (!MONTHS.includes(mm)) return null
  }
  let month = MONTHS.indexOf(mm) + 1
  if (month > 12) month -= 12
  if (dd.endsWith(',')) dd = dd.slice(0, -1)
  if (yy.indexOf(':') > 0) [yy, tm] = [tm, yy]
  if (yy.endsWith(',')) {
    yy = yy.slice(0, -1)
    if (!yy) return null
  }
  if (!/^\p{Nd}/u.test(yy)) [yy, tz] = [tz, yy]
  if (tm.endsWith(',')) tm = tm.slice(0, -1)
  let time = tm.split(':')
  if (time.length === 1 && tm.includes('.')) {
    time = tm.split('.')
    if (time.length !== 2 && time.length !== 3) return null
  } else if (time.length !== 2 && time.length !== 3) return null
  const [hh = '', mi = '', ss = '0'] = time
  const numbers = [yy, dd, hh, mi, ss].map(pyParseInt)
  if (numbers.some((n) => n === null)) return null
  let [year = 0, day = 0, hour = 0, minute = 0, second = 0] =
    numbers as number[]
  if (year < 100) year += year > 68 ? 1900 : 2000
  const offset = offsetOf(tz)
  if (
    !isValidDate(year, month, day) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59 ||
    second < 0 ||
    second > 59 ||
    (offset !== null && Math.abs(offset) >= 86_400)
  )
    return null
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
