// Age ratings on the scale L, 6, 10, 12, 14, 16, 18
// (`catalogo/classificacao.py`).
//
// The table comes from the age-rating research, with the 6 decided in #15:
// take the minimum age to watch without a guardian and round up to the next
// step, so a conversion never lets a younger child in. Exceptions from the
// research and #15:
//
// - MPA R is 16, not 18 (it agrees with ClassInd in 41% of films, against
//   25%).
// - FSK 6, Kijkwijzer 6 and Medierådet 7 fall on 6.
// - The "all ages" of EIRIN (G) and of the French CNC (tous publics) counts
//   as no information: both come out milder than ClassInd in over 80% of
//   films. So EIRIN and CNC count only when they restrict.
//
// A label outside the table also counts as no information.

import { casefold, pyStrip } from '../compat/index.ts'
import { PY_WHITESPACE_CLASS } from '../compat/whitespace.ts'

export const AGE_SCALE = ['L', '6', '10', '12', '14', '16', '18'] as const
export type AgeRating = (typeof AGE_SCALE)[number]

/** Wikidata's ClassInd property. */
export const CLASSIND = 'P3216'
/** Wikidata's MPA property; OMDb's `Rated` is read with its row. */
export const MPA = 'P1657'

/** Wikidata property → [system, {normalized label: rating}], in Python's
 * order (it breaks ties between systems). */
const AGE_SYSTEMS: ReadonlyArray<
  readonly [string, string, Readonly<Record<string, AgeRating>>]
> = [
  [
    CLASSIND,
    'ClassInd',
    {
      l: 'L',
      al: 'L',
      livre: 'L',
      '6': '6',
      '10': '10',
      '12': '12',
      '14': '14',
      '16': '16',
      '18': '18',
    },
  ],
  [
    MPA,
    'MPA',
    {
      g: 'L',
      pg: '10',
      m: '10',
      gp: '10',
      'pg-13': '14',
      r: '16',
      'nc-17': '18',
      x: '18',
    },
  ],
  [
    'P2629',
    'BBFC',
    {
      u: 'L',
      pg: '10',
      '12': '12',
      '12a': '12',
      '15': '16',
      '18': '18',
      x: '18',
    },
  ],
  ['P1981', 'FSK', { '0': 'L', '6': '6', '12': '12', '16': '16', '18': '18' }],
  [
    'P2684',
    'Kijkwijzer',
    {
      al: 'L',
      '6': '6',
      '9': '10',
      '12': '12',
      '14': '14',
      '16': '16',
      '18': '18',
    },
  ],
  [
    'P5970',
    'Medierådet',
    {
      a: 'L',
      'tilladt for alle': 'L',
      'suitable for a general audience': 'L',
      '7': '6',
      'suitable for a general audience, but not recommended for children under 7':
        '6',
      '11': '12',
      'for ages 11 and up': '12',
      '12': '12',
      'for ages 12 and up': '12',
      '15': '16',
      'for ages 15 and up': '16',
      '16': '16',
      'prohibited for children under 16': '16',
    },
  ],
  ['P2756', 'EIRIN', { pg12: '12', 'r15+': '16', 'r18+': '18' }],
  [
    'P2758',
    'CNC',
    {
      '-12': '12',
      'no minors under twelve': '12',
      '-16': '16',
      'no minors under sixteen': '16',
      '-18': '18',
      'no minors under eighteen': '18',
      x: '18',
      'x rating (incitement to violence)': '18',
      'x rating (pornographic content)': '18',
    },
  ],
]

/** The systems in Python's order. */
export const SYSTEM_ORDER: ReadonlyArray<string> = AGE_SYSTEMS.map(
  ([, system]) => system,
)

/** The rating in years, to compare with the child's age. L is 0. */
export const ratingAge = (rating: string): number =>
  rating === 'L' ? 0 : Number.parseInt(rating, 10)

const SPACES = new RegExp(`${PY_WHITESPACE_CLASS}+`, 'gu')

/** "FSK 12" becomes "12"; "  PG-13 " becomes "pg-13". */
const normalize = (label: string, system: string): string => {
  let text = casefold(pyStrip(label)).replace(SPACES, ' ')
  const prefix = `${casefold(system)} `
  if (text.startsWith(prefix)) text = text.slice(prefix.length)
  if (system === 'BBFC') {
    if (text.startsWith('certificado '))
      text = text.slice('certificado '.length)
    if (text.endsWith(' certificate'))
      text = text.slice(0, -' certificate'.length)
  }
  return text
}

/** [system, rating] of a label, or `undefined` when the table does not take
 * it (Python's `converter`). */
export const convertRating = (
  property: string,
  label: string,
): readonly [string, AgeRating] | undefined => {
  const entry = AGE_SYSTEMS.find(([p]) => p === property)
  if (entry === undefined) return undefined
  const [, system, table] = entry
  const key = normalize(label, system)
  const rating = Object.hasOwn(table, key) ? table[key] : undefined
  return rating === undefined ? undefined : [system, rating]
}
