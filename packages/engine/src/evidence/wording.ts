// How Evidence lines read, in Portuguese (`evidencia/texto.py`). The Claude
// copies these lines word for word, and the verifier parses them.

import { pyFormatG, pyRepr, pyRound, thousandsDot } from '../compat/number.ts'
import { pythonError } from '../compat/python-error.ts'
import type { SeedKind } from './ruler.ts'

/** A rating as the lines write it: 5.0 is "5"; 4.5 is "4,5". */
export const ratingText = (value: number): string =>
  pyFormatG(value).replaceAll('.', ',')

/** How a stated rating opens a seed line ("love" is 5, "hate" is 1). */
const STATED: Readonly<Record<string, string>> = {
  'stated 5': 'disse que ama',
  'stated 1': 'disse que odeia',
  'report 5': 'segundo o Dono, ama',
  'report 1': 'segundo o Dono, odeia',
}

/** The start of a seed rating's line: "deu 4,5 a X", "disse que ama X",
 * "segundo o Dono, odeia X". A stated or reported seed is 5 or 1. */
export const seedText = (
  kind: SeedKind,
  value: number,
  film: string,
): string => {
  if (kind === 'rating') return `deu ${ratingText(value)} a ${film}`
  const opening = STATED[`${kind} ${value}`]
  if (opening === undefined) {
    throw pythonError('KeyError', `('${kind}', ${pyRepr(value)})`)
  }
  return `${opening} ${film}`
}

/** "a", "a e b", "a, b e c". */
export const listText = (items: ReadonlyArray<string>): string =>
  items.length <= 1
    ? items.join('')
    : `${items.slice(0, -1).join(', ')} e ${items.at(-1)}`

/** "Título (1999)", or the title alone without a year. */
export const filmText = (title: string, year: number | null): string =>
  year ? `${title} (${year})` : title

/** 3104 is "3.104". */
export const integerText = (value: number): string => thousandsDot(value)

/** 104 is "1h44"; 120 is "2h"; 45 is "45min". */
export const durationText = (minutes: number): string => {
  const hours = Math.floor(minutes / 60)
  const rest = minutes - hours * 60
  if (!hours) return `${rest}min`
  return rest ? `${hours}h${String(rest).padStart(2, '0')}` : `${hours}h`
}

/** The taste neighbours' line (#174, worded by #221): "23 pessoas de gosto
 * parecido deram 4,3 em média a este filme", their mean rating to one
 * place. */
export const tasteNeighborsText = (
  raters: number,
  meanRating: number,
): string =>
  `${integerText(raters)} pessoas de gosto parecido deram ${ratingText(pyRound(meanRating, 1))} em média a este filme`

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

/** "sex, 20 nov": an ISO day (a Session's `data`) as the app writes a
 * Session's day (#272). */
export const weekdayDateText = (iso: string): string => {
  const [year, month, day] = iso.slice(0, 10).split('-').map(Number) as [
    number,
    number,
    number,
  ]
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return `${WEEKDAYS[weekday]}, ${day} ${MONTHS[month - 1]}`
}

/** "8 de 10": a Nota of the 0,5–5 scale as the app shows it, on 1–10
 * (#272). */
export const tenScaleText = (value: number): string =>
  `${ratingText(value * 2)} de 10`
