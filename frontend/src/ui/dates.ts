// The dates a page shows, in PT-BR and short (#268): "1 jun 2025", and the
// year left out when the caller says it is the current one. Code, not a
// component: a screen's `Meta` line and the page titles take it.

const MONTHS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const

const DAY = /^(\d{4})-(\d{2})-(\d{2})/

/** The calendar day of an ISO date or timestamp, as written: no time zone
 * moves it. */
function partsOf(iso: string) {
  const match = DAY.exec(iso)
  if (!match) return null
  const [, year, month, day] = match.map(Number) as [number, number, number, number]
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}

/** "1 jun 2025"; "1 jun" when `currentYear` is its year. Anything that is
 * not an ISO date comes back as it is. */
export function shortDate(iso: string, currentYear?: number): string {
  const parts = partsOf(iso)
  if (!parts) return iso
  const { year, month, day } = parts
  const date = `${day} ${MONTHS[month - 1]}`
  return year === currentYear ? date : `${date} ${year}`
}

/** "sex, 20 nov": a Session's day, for its page title. */
export function weekdayDate(iso: string): string {
  const parts = partsOf(iso)
  if (!parts) return iso
  const { year, month, day } = parts
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()]
  return `${weekday}, ${day} ${MONTHS[month - 1]}`
}
