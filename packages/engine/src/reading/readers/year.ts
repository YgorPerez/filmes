// The release years: "dos anos 90", "depois de 2010", "a partir de 2010",
// "antes de 1980", "até 2015", "entre 1990 e 2000". "Depois" and "antes"
// leave the year out: "depois de 2010" is from 2011.

import { Effect, Schema } from 'effect'
import { yearModule } from '../../recommendation/constraints/year.ts'
import { makeReader, scan, type Claim } from '../reader.ts'
import { phrasesOf, type Words } from '../words.ts'

const Vocabulary = Schema.Struct({
  decade: Schema.Array(Schema.String),
  after: Schema.Array(Schema.String),
  since: Schema.Array(Schema.String),
  before: Schema.Array(Schema.String),
  until: Schema.Array(Schema.String),
  between: Schema.Array(Schema.String),
  and: Schema.Array(Schema.String),
})

/** The phrases of one end of the range, which end it sets, and what it
 * adds to the year it names. */
const BOUNDS = [
  { kind: 'after', end: 'since', offset: 1 },
  { kind: 'since', end: 'since', offset: 0 },
  { kind: 'before', end: 'until', offset: -1 },
  { kind: 'until', end: 'until', offset: 0 },
] as const

const YEAR = /^\d{4}$/u
const DECADE = /^(?:\d0|\d{3}0)$/u

const yearAt = (words: Words, i: number): number | undefined =>
  words.free(i) && YEAR.test(words.key(i)) ? Number(words.key(i)) : undefined

/** "90" is 1990, "00" and "10" are 2000 and 2010, "1970" is 1970. */
const decadeAt = (words: Words, i: number): number | undefined => {
  const key = words.key(i)
  if (!words.free(i) || !DECADE.test(key)) return undefined
  const n = Number(key)
  if (key.length === 4) return n
  return n <= 10 ? 2000 + n : 1900 + n
}

const claim = (
  start: number,
  end: number,
  since: number | null,
  until: number | null,
): Claim => ({
  start,
  end,
  found: {
    request: {
      ...(since === null ? {} : { since }),
      ...(until === null ? {} : { until }),
    },
    label: yearModule.label({ name: 'year', since, until }),
  },
})

export const yearReader = makeReader({
  field: 'year',
  section: 'year',
  vocabulary: Vocabulary,
  read: (words, vocabulary) => {
    const phrases = {
      decade: phrasesOf(vocabulary.decade),
      after: phrasesOf(vocabulary.after),
      since: phrasesOf(vocabulary.since),
      before: phrasesOf(vocabulary.before),
      until: phrasesOf(vocabulary.until),
      between: phrasesOf(vocabulary.between),
      and: phrasesOf(vocabulary.and),
    }
    /** The year a phrase of `kind` at `i` names, and the word after it. */
    const yearAfter = (
      i: number,
      kind: keyof typeof phrases,
      read: (words: Words, i: number) => number | undefined = yearAt,
    ) => {
      const length = words.longest(i, phrases[kind])
      const value = length > 0 ? read(words, i + length) : undefined
      return value === undefined || !words.span(i, i + length + 1)
        ? undefined
        : { value, end: i + length + 1 }
    }
    return Effect.succeed(
      scan(words, (i) => {
        const decade = yearAfter(i, 'decade', decadeAt)
        if (decade) return claim(i, decade.end, decade.value, decade.value + 9)
        const first = yearAfter(i, 'between')
        const last = first && yearAfter(first.end, 'and')
        if (first && last)
          return claim(
            i,
            last.end,
            Math.min(first.value, last.value),
            Math.max(first.value, last.value),
          )
        for (const { kind, end, offset } of BOUNDS) {
          const bound = yearAfter(i, kind)
          if (bound === undefined) continue
          const year = bound.value + offset
          return end === 'since'
            ? claim(i, bound.end, year, null)
            : claim(i, bound.end, null, year)
        }
        return undefined
      }),
    )
  },
})
