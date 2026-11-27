// How Evidence lines read, in Portuguese (`evidencia/texto.py`). The Claude
// copies these lines word for word, and the verifier parses them.

import { pyFormatG, pyRepr, pyRound, thousandsDot } from '../compat/number.ts'
import { pythonError } from '../compat/python-error.ts'
import type { SeedKind } from './ruler.ts'
import type { Strength } from './strength.ts'

/** A rating as the lines write it: 5.0 is "5"; 4.5 is "4,5". */
export const ratingText = (value: number): string =>
  pyFormatG(value).replaceAll('.', ',')

/** A Presente's own wording and how it reads when two or more Presentes
 * share the line (#351): the Cartaz writes "Você e Iara: deram 10 de 10 a
 * X" (`billboard/model.ts`). `start`: only as the line's opening. Each
 * plural sits next to its singular, so a new singular wording comes with
 * one. */
export interface PluralWording {
  readonly one: string
  readonly many: string
  readonly start: boolean
}

/** How a stated rating opens a seed line ("love" is 5, "hate" is 1). */
const STATED: Readonly<Record<string, PluralWording>> = {
  'stated 5': {
    one: 'disse que ama ',
    many: 'disseram que amam ',
    start: true,
  },
  'stated 1': {
    one: 'disse que odeia ',
    many: 'disseram que odeiam ',
    start: true,
  },
  'report 5': {
    one: 'segundo o Dono, ama ',
    many: 'segundo o Dono, amam ',
    start: true,
  },
  'report 1': {
    one: 'segundo o Dono, odeia ',
    many: 'segundo o Dono, odeiam ',
    start: true,
  },
}

/** How a seed Nota opens its line: "deu 9 de 10 a X". */
const RATED: PluralWording = { one: 'deu ', many: 'deram ', start: true }

/** The plurals of a seed line's openings. */
export const SEED_PLURALS: ReadonlyArray<PluralWording> = [
  RATED,
  ...Object.values(STATED),
]

/** The start of a seed rating's line: "deu 9 de 10 a X", "disse que ama
 * X", "segundo o Dono, odeia X". A Nota is written on the 1 to 10 scale of
 * the Cartaz's Já vi, whatever the source's (#272, #277). A stated or
 * reported seed is 5 or 1. */
export const seedText = (
  kind: SeedKind,
  value: number,
  film: string,
): string => {
  if (kind === 'rating') return `${RATED.one}${tenScaleText(value)} a ${film}`
  const opening = STATED[`${kind} ${value}`]
  if (opening === undefined) {
    throw pythonError('KeyError', `('${kind}', ${pyRepr(value)})`)
  }
  return `${opening.one}${film}`
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
 * parecido deram 8,6 de 10 em média a este filme", their mean rating on
 * the 1 to 10 scale, to one place (#272). */
export const tasteNeighborsText = (
  raters: number,
  meanRating: number,
): string =>
  `${integerText(raters)} pessoas de gosto parecido deram ${ratingText(pyRound(meanRating * 2, 1))} de 10 em média a este filme`

/** The MovieLens "4+" of 5 stars: a seed Nota under it did not do what
 * the neighbourhood's people did. */
const NEIGHBORHOOD_CUT = 4

/** Whether a seed Nota is under the MovieLens neighbourhood's 8 of 10. */
export const belowNeighborhoodCut = (kind: SeedKind, value: number): boolean =>
  kind === 'rating' && value < NEIGHBORHOOD_CUT

/** What a seed line adds after the film when the Nota is under 8 of 10 and
 * the ruler reads it as moderate or strong for her, by its percentile on
 * her scale (#272, #277): ", uma das notas mais altas que dá". Vera's "deu
 * 6 de 10" under ●●○ is otherwise a lukewarm reason. A weak seed is no
 * high Nota, and a pairwise answer's is weak. */
export const OWN_SCALE_TEXT = ', uma das notas mais altas que dá'

export const OWN_SCALE_PLURAL: PluralWording = {
  one: OWN_SCALE_TEXT,
  many: ', uma das notas mais altas que dão',
  start: false,
}

export const ownScaleText = (
  kind: SeedKind,
  value: number,
  [strength, direction]: readonly [Strength, number],
): string =>
  belowNeighborhoodCut(kind, value) && direction > 0 && strength !== 'weak'
    ? OWN_SCALE_TEXT
    : ''

/** The MovieLens neighbourhood's base (#221): "das 3.104 pessoas que
 * deram 8 ou mais a ele, 64% fizeram o mesmo com este". The MovieLens "4+"
 * of 5 stars, on the 1 to 10 scale (#272). Over a seed Nota under that cut
 * "o mesmo" points at what she did not do, so the line says it whole: "30%
 * deram 8 ou mais a este" (#272). */
export const neighborhoodText = (
  base: number,
  both: number,
  seedBelowCut = false,
): string =>
  `das ${integerText(base)} pessoas que deram 8 ou mais a ele, ` +
  `${Math.floor((100 * both) / base)}% ` +
  (seedBelowCut ? 'deram 8 ou mais a este' : 'fizeram o mesmo com este')

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
